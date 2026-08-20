import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { writeAudit } from "./audit.server";

const DEPTS = ["IT", "HR", "Finance", "Operations"] as const;
const PRIOS = ["Low", "Medium", "High", "Urgent"] as const;

// -------- Low-confidence review queue --------
export const listLowConfidenceQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("tickets")
      .select("id, ticket_number, description, department, subcategory, priority, confidence, status, created_at")
      .eq("ai_classified", true)
      .lt("confidence", 0.6)
      .in("status", ["New", "Needs Review", "In Progress"])
      .order("confidence", { ascending: true })
      .limit(50);
    if (error) throw new Error("Failed to load queue");
    return data ?? [];
  });

// -------- Manual reclassification --------
export const reclassifyTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ticket_id: z.string().uuid(),
        department: z.enum(DEPTS),
        subcategory: z.string().trim().min(1).max(120),
        priority: z.enum(PRIOS),
        reason: z.string().trim().max(600).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: t }, { data: prof }, { data: roleRow }] = await Promise.all([
      supabaseAdmin
        .from("tickets")
        .select("department, subcategory, priority, confidence")
        .eq("id", data.ticket_id)
        .maybeSingle(),
      supabaseAdmin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId).maybeSingle(),
    ]);
    if (!t) throw new Error("Ticket not found");
    const role = (roleRow?.role ?? "analyst") as "analyst" | "admin" | "crew";
    if (role === "crew") throw new Error("Not permitted");

    const { error } = await supabaseAdmin
      .from("tickets")
      .update({
        department: data.department,
        subcategory: data.subcategory,
        priority: data.priority,
        confidence: 1,
        ai_classified: false,
      })
      .eq("id", data.ticket_id);
    if (error) throw new Error("Could not reclassify");

    await supabaseAdmin.from("ai_classification_corrections").insert({
      ticket_id: data.ticket_id,
      corrected_by: context.userId,
      corrected_by_name: prof?.full_name ?? "Staff",
      original_department: t.department,
      original_subcategory: t.subcategory,
      original_priority: t.priority,
      original_confidence: t.confidence,
      new_department: data.department,
      new_subcategory: data.subcategory,
      new_priority: data.priority,
      reason: data.reason ?? null,
    });

    await writeAudit(supabaseAdmin, {
      ticket_id: data.ticket_id,
      actor_kind: role,
      actor_user_id: context.userId,
      actor_name: prof?.full_name ?? "Staff",
      action: "ticket.reclassified",
      details: {
        from: { department: t.department, subcategory: t.subcategory, priority: t.priority },
        to: { department: data.department, subcategory: data.subcategory, priority: data.priority },
        reason: data.reason ?? null,
      },
    });
    return { ok: true };
  });

// -------- Related tickets --------
export const getRelatedTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ticket_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin
      .from("tickets")
      .select("id, department, subcategory, submitter_guest_id, on_behalf_of_guest_id")
      .eq("id", data.ticket_id)
      .maybeSingle();
    if (!t) return { sameCategory: [], sameGuest: [], resolvedSimilar: [] };

    const guestId = t.submitter_guest_id ?? t.on_behalf_of_guest_id;

    const sameCategoryQ = supabaseAdmin
      .from("tickets")
      .select("id, ticket_number, description, status, priority, created_at, resolved_at")
      .eq("department", t.department!)
      .eq("subcategory", t.subcategory!)
      .neq("id", t.id)
      .order("created_at", { ascending: false })
      .limit(6);

    const sameGuestQ = guestId
      ? supabaseAdmin
          .from("tickets")
          .select("id, ticket_number, description, status, priority, created_at, resolved_at")
          .or(`submitter_guest_id.eq.${guestId},on_behalf_of_guest_id.eq.${guestId}`)
          .neq("id", t.id)
          .order("created_at", { ascending: false })
          .limit(6)
      : Promise.resolve({ data: [] as any[] });

    const resolvedSimilarQ = supabaseAdmin
      .from("tickets")
      .select("id, ticket_number, description, resolved_at, department, subcategory")
      .eq("department", t.department!)
      .eq("subcategory", t.subcategory!)
      .eq("status", "Resolved")
      .neq("id", t.id)
      .order("resolved_at", { ascending: false })
      .limit(5);

    const [sc, sg, rs] = await Promise.all([sameCategoryQ, sameGuestQ, resolvedSimilarQ]);

    // Attach the final response body for resolvedSimilar
    const resolved = rs.data ?? [];
    const withResponses = await Promise.all(
      resolved.map(async (r) => {
        const { data: resp } = await supabaseAdmin
          .from("ticket_responses")
          .select("body, created_at")
          .eq("ticket_id", r.id)
          .eq("is_internal_note", false)
          .order("created_at", { ascending: false })
          .limit(1);
        return { ...r, final_response: resp?.[0]?.body ?? null };
      }),
    );

    return {
      sameCategory: sc.data ?? [],
      sameGuest: (sg as any).data ?? [],
      resolvedSimilar: withResponses,
    };
  });

// -------- Resolve similar (copy response + resolve) --------
export const resolveSimilar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ticket_id: z.string().uuid(),
        source_ticket_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: src } = await supabaseAdmin
      .from("ticket_responses")
      .select("body")
      .eq("ticket_id", data.source_ticket_id)
      .eq("is_internal_note", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!src) throw new Error("No response found on source ticket");

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();

    await supabaseAdmin.from("ticket_responses").insert({
      ticket_id: data.ticket_id,
      author_user_id: context.userId,
      body: src.body,
      is_internal_note: false,
    });
    await supabaseAdmin
      .from("tickets")
      .update({ first_response_at: new Date().toISOString() })
      .eq("id", data.ticket_id)
      .is("first_response_at", null);
    await writeAudit(supabaseAdmin, {
      ticket_id: data.ticket_id,
      actor_kind: "analyst",
      actor_user_id: context.userId,
      actor_name: prof?.full_name ?? "Analyst",
      action: "ticket.resolved_similar_applied",
      details: { source_ticket_id: data.source_ticket_id },
    });
    return { ok: true };
  });

// -------- Predicted next action --------
export const predictNextAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ticket_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin
      .from("tickets")
      .select("status, priority, confidence, first_response_at, ai_classified, assigned_to, escalated_by, created_at, department, subcategory")
      .eq("id", data.ticket_id)
      .maybeSingle();
    if (!t) return { action: "review", label: "Review ticket", reason: "Not found" };

    const ageMin = (Date.now() - new Date(t.created_at).getTime()) / 60000;

    if (t.status === "New" && !t.assigned_to)
      return { action: "accept", label: "Accept ticket", reason: "Unassigned and new — pick it up to start the SLA clock." };
    if (t.ai_classified && (t.confidence ?? 0) < 0.6)
      return { action: "reclassify", label: "Reclassify", reason: `AI confidence is ${(Math.round((t.confidence ?? 0) * 100))}%. Verify department, subcategory and priority.` };
    if (!t.first_response_at && (t.priority === "Urgent" || t.priority === "High"))
      return { action: "respond", label: "Send first response", reason: `${t.priority} priority ticket has no first response yet (${Math.round(ageMin)}m old).` };
    if (!t.first_response_at)
      return { action: "respond", label: "Send first response", reason: "No response yet — greet the requester and set expectations." };
    if (t.status === "In Progress" && t.priority === "Urgent" && ageMin > 60 && !t.escalated_by)
      return { action: "escalate", label: "Escalate to admin", reason: "Urgent ticket has been open >1h without resolution." };
    if (t.status === "In Progress")
      return { action: "resolve", label: "Resolve ticket", reason: "Response sent — if the issue is fixed, close it out." };
    return { action: "review", label: "Review ticket", reason: "No automatic recommendation." };
  });

// -------- Analyst workload dashboard --------
export const getAnalystWorkload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: analysts, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "analyst");
    if (error) throw new Error("Failed to load analysts");

    const rows = await Promise.all(
      (analysts ?? []).map(async (a) => {
        const [{ data: prof }, { data: presence }, { data: profile }, active, resolvedToday] = await Promise.all([
          supabaseAdmin.from("profiles").select("full_name, email").eq("id", a.user_id).maybeSingle(),
          supabaseAdmin.from("analyst_presence").select("status, last_seen_at").eq("user_id", a.user_id).maybeSingle(),
          supabaseAdmin.from("analyst_profiles").select("department, skill_tags, max_concurrent").eq("user_id", a.user_id).maybeSingle(),
          supabaseAdmin
            .from("tickets")
            .select("id, priority, status", { count: "exact", head: false })
            .eq("assigned_to", a.user_id)
            .in("status", ["New", "In Progress", "Needs Review"]),
          supabaseAdmin
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .eq("assigned_to", a.user_id)
            .eq("status", "Resolved")
            .gte("resolved_at", new Date(Date.now() - 24 * 3600_000).toISOString()),
        ]);
        const activeTickets = active.data ?? [];
        const urgent = activeTickets.filter((t: any) => t.priority === "Urgent").length;
        const high = activeTickets.filter((t: any) => t.priority === "High").length;
        const onlineFresh =
          presence?.status === "online" &&
          presence?.last_seen_at &&
          Date.now() - new Date(presence.last_seen_at).getTime() < 3 * 60_000;
        return {
          user_id: a.user_id,
          name: prof?.full_name ?? prof?.email ?? "Analyst",
          department: profile?.department ?? null,
          skills: profile?.skill_tags ?? [],
          max_concurrent: profile?.max_concurrent ?? 5,
          active: activeTickets.length,
          urgent,
          high,
          resolved_24h: resolvedToday.count ?? 0,
          online: !!onlineFresh,
          utilization: profile?.max_concurrent
            ? Math.min(100, Math.round((activeTickets.length / profile.max_concurrent) * 100))
            : 0,
        };
      }),
    );
    rows.sort((a, b) => b.utilization - a.utilization);
    return rows;
  });
