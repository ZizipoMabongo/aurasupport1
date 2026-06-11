import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { classifySubmission, aiDraftResponse } from "./ai-classifier.server";
import { writeAudit } from "./audit.server";

const SubmitInput = z.object({
  description: z.string().trim().min(5).max(2000),
  // Who is submitting:
  submitter: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("guest"),
      guest_id: z.string().min(1),
    }),
    z.object({
      kind: z.literal("staff"),
      mode: z.enum(["self", "on_behalf_of_guest"]),
      on_behalf_of_guest_id: z.string().optional(),
    }),
  ]),
});

// PUBLIC submission endpoint (guests + staff both call it).
// Staff path validates auth via the bearer token; guest path validates guest_id.
export const submitTicket = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SubmitInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let effectiveRole: "guest" | "crew";
    let submitterType: "guest" | "staff";
    let submitterGuestId: string | null = null;
    let submitterUserId: string | null = null;
    let onBehalfGuestId: string | null = null;
    let actorKind: "guest" | "crew";
    let actorUserId: string | null = null;
    let actorGuestId: string | null = null;
    let actorName = "";

    if (data.submitter.kind === "guest") {
      const gid = data.submitter.guest_id.toUpperCase();
      const { data: g } = await supabaseAdmin
        .from("guests")
        .select("guest_id, full_name")
        .eq("guest_id", gid)
        .maybeSingle();
      if (!g) throw new Error("Invalid guest");
      submitterType = "guest";
      submitterGuestId = gid;
      effectiveRole = "guest";
      actorKind = "guest";
      actorGuestId = gid;
      actorName = g.full_name;
    } else {
      // staff path — validate bearer token manually so this fn stays public-callable
      // but staff submissions require auth
      const { getRequest } = await import("@tanstack/react-start/server");
      const req = getRequest();
      const auth = req?.headers.get("authorization");
      if (!auth?.startsWith("Bearer "))
        throw new Error("Staff must be signed in");
      const token = auth.slice(7);
      const { data: claims, error: cErr } = await supabaseAdmin.auth.getUser(token);
      if (cErr || !claims.user) throw new Error("Invalid session");
      const uid = claims.user.id;
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", uid)
        .maybeSingle();
      const { data: roleRow } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .maybeSingle();
      if (!roleRow) throw new Error("No role assigned");
      submitterType = "staff";
      submitterUserId = uid;
      actorUserId = uid;
      actorName = prof?.full_name ?? "Staff";
      if (data.submitter.mode === "on_behalf_of_guest") {
        if (!data.submitter.on_behalf_of_guest_id)
          throw new Error("Select a guest");
        const gid = data.submitter.on_behalf_of_guest_id.toUpperCase();
        const { data: g } = await supabaseAdmin
          .from("guests")
          .select("guest_id")
          .eq("guest_id", gid)
          .maybeSingle();
        if (!g) throw new Error("Invalid guest");
        onBehalfGuestId = gid;
        effectiveRole = "guest"; // crucial rule
        actorKind = "crew";
      } else {
        effectiveRole = "crew";
        actorKind = "crew";
      }
    }

    // Classify (may split into multiple tickets)
    const classified = await classifySubmission(data.description, effectiveRole);

    // Role validation: guest-effective submissions must have guest_allowed === true
    const rejected = classified.filter(
      (c) => effectiveRole === "guest" && !c.guest_allowed,
    );
    const accepted = classified.filter(
      (c) => effectiveRole === "crew" || c.guest_allowed,
    );

    if (accepted.length === 0) {
      return {
        created: [],
        rejected: rejected.map((r) => ({
          department: r.department,
          subcategory: r.subcategory,
          reason:
            "This type of request is not available to guests. Please contact crew directly if you need help.",
        })),
      };
    }

    const parentId = crypto.randomUUID();
    const rows = accepted.map((c) => ({
      submitter_type: submitterType,
      submitter_guest_id: submitterGuestId,
      submitter_user_id: submitterUserId,
      on_behalf_of_guest_id: onBehalfGuestId,
      effective_role: effectiveRole,
      description: c.description,
      department: c.department,
      subcategory: c.subcategory,
      priority: c.priority,
      confidence: c.confidence,
      guest_allowed: c.guest_allowed,
      ai_classified: c.ai_classified,
      parent_submission_id: accepted.length > 1 ? parentId : null,
      status: "New" as const,
    }));

    const { data: created, error } = await supabaseAdmin
      .from("tickets")
      .insert(rows)
      .select("*");
    if (error) {
      console.error("[submit] insert failed:", error);
      throw new Error("Could not create ticket");
    }

    for (const t of created ?? []) {
      await writeAudit(supabaseAdmin, {
        ticket_id: t.id,
        actor_kind: actorKind,
        actor_user_id: actorUserId,
        actor_guest_id: actorGuestId,
        actor_name: actorName,
        action: "ticket.created",
        details: {
          department: t.department,
          priority: t.priority,
          ai_classified: t.ai_classified,
          confidence: t.confidence,
          split: accepted.length > 1,
        },
      });
    }

    return {
      created: created ?? [],
      rejected: rejected.map((r) => ({
        department: r.department,
        subcategory: r.subcategory,
        reason:
          "This type of request is not available to guests. Please contact crew directly if you need help.",
      })),
    };
  });

// ------------------- Staff queries & actions -------------------

export const listAllTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        department: z.string().optional(),
        priority: z.string().optional(),
        status: z.string().optional(),
        scope: z.enum(["all", "mine", "escalated", "guest", "crew"]).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("tickets").select("*").order("created_at", { ascending: false });
    if (data.department && data.department !== "all") q = q.eq("department", data.department as "IT" | "HR" | "Finance" | "Operations");
    if (data.priority && data.priority !== "all") q = q.eq("priority", data.priority as "Low" | "Medium" | "High" | "Urgent");
    if (data.status && data.status !== "all") q = q.eq("status", data.status as "New" | "Needs Review" | "In Progress" | "Escalated" | "Resolved" | "Rejected");
    if (data.scope === "mine") q = q.eq("assigned_to", context.userId);
    if (data.scope === "escalated") q = q.eq("status", "Escalated");
    if (data.scope === "guest") q = q.eq("effective_role", "guest");
    if (data.scope === "crew") q = q.eq("effective_role", "crew");
    const { data: rows, error } = await q;
    if (error) throw new Error("Failed to load tickets");
    return rows ?? [];
  });

export const getStaffTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ticket_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [ticket, resp, chat, audit, guest, assignedProf, escalatedProf] = await Promise.all([
      supabaseAdmin.from("tickets").select("*").eq("id", data.ticket_id).maybeSingle(),
      supabaseAdmin.from("ticket_responses").select("*").eq("ticket_id", data.ticket_id).order("created_at"),
      supabaseAdmin.from("chat_messages").select("*").eq("ticket_id", data.ticket_id).order("created_at"),
      supabaseAdmin.from("audit_log").select("*").eq("ticket_id", data.ticket_id).order("created_at"),
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.resolve(null),
    ]);
    if (!ticket.data) throw new Error("Ticket not found");
    const t = ticket.data;
    const gid = t.submitter_guest_id ?? t.on_behalf_of_guest_id;
    let g = null;
    if (gid) {
      const r = await supabaseAdmin.from("guests").select("*").eq("guest_id", gid).maybeSingle();
      g = r.data;
    }
    let submitterStaff = null;
    if (t.submitter_user_id) {
      const r = await supabaseAdmin.from("profiles").select("id, full_name, email").eq("id", t.submitter_user_id).maybeSingle();
      submitterStaff = r.data;
    }
    return {
      ticket: t,
      responses: resp.data ?? [],
      chat: chat.data ?? [],
      audit: audit.data ?? [],
      guest: g,
      submitterStaff,
    };
  });

export const acceptTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ticket_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    const { data: roleRow } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId).maybeSingle();
    const role = roleRow?.role ?? "analyst";
    const update: { status: "In Progress"; assigned_to?: string; escalated_to?: string } = { status: "In Progress" };
    if (role === "admin") update.escalated_to = context.userId;
    else update.assigned_to = context.userId;
    const { error } = await supabaseAdmin.from("tickets").update(update).eq("id", data.ticket_id);
    if (error) throw new Error("Could not accept ticket");
    await writeAudit(supabaseAdmin, {
      ticket_id: data.ticket_id,
      actor_kind: role as "analyst" | "admin",
      actor_user_id: context.userId,
      actor_name: prof?.full_name ?? "Staff",
      action: "ticket.accepted",
    });
    return { ok: true };
  });

export const respondTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ticket_id: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
        is_internal_note: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    const { data: roleRow } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId).maybeSingle();
    const role = roleRow?.role ?? "analyst";
    const { error } = await supabaseAdmin.from("ticket_responses").insert({
      ticket_id: data.ticket_id,
      author_user_id: context.userId,
      body: data.body,
      is_internal_note: data.is_internal_note,
    });
    if (error) throw new Error("Could not save response");
    if (!data.is_internal_note) {
      await supabaseAdmin
        .from("tickets")
        .update({ first_response_at: new Date().toISOString() })
        .eq("id", data.ticket_id)
        .is("first_response_at", null);
    }
    await writeAudit(supabaseAdmin, {
      ticket_id: data.ticket_id,
      actor_kind: role as "analyst" | "admin",
      actor_user_id: context.userId,
      actor_name: prof?.full_name ?? "Staff",
      action: data.is_internal_note ? "ticket.note_added" : "ticket.responded",
    });
    return { ok: true };
  });

export const resolveTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ticket_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    const { data: roleRow } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId).maybeSingle();
    const role = roleRow?.role ?? "analyst";
    const { error } = await supabaseAdmin
      .from("tickets")
      .update({ status: "Resolved", resolved_at: new Date().toISOString() })
      .eq("id", data.ticket_id);
    if (error) throw new Error("Could not resolve");
    await writeAudit(supabaseAdmin, {
      ticket_id: data.ticket_id,
      actor_kind: role as "analyst" | "admin",
      actor_user_id: context.userId,
      actor_name: prof?.full_name ?? "Staff",
      action: "ticket.resolved",
    });
    return { ok: true };
  });

export const escalateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ticket_id: z.string().uuid(), reason: z.string().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    const { error } = await supabaseAdmin
      .from("tickets")
      .update({ status: "Escalated" })
      .eq("id", data.ticket_id);
    if (error) throw new Error("Could not escalate");

    // System message in the same chat thread (continuity rule)
    await supabaseAdmin.from("chat_messages").insert({
      ticket_id: data.ticket_id,
      sender_kind: "system",
      sender_name: "System",
      body: `Ticket escalated to admin${data.reason ? `: ${data.reason}` : ""}. The conversation continues here.`,
    });

    await writeAudit(supabaseAdmin, {
      ticket_id: data.ticket_id,
      actor_kind: "analyst",
      actor_user_id: context.userId,
      actor_name: prof?.full_name ?? "Analyst",
      action: "ticket.escalated",
      details: { reason: data.reason ?? null },
    });
    return { ok: true };
  });

export const rejectEscalation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ticket_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRow } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId).maybeSingle();
    if (roleRow?.role !== "admin") throw new Error("Admins only");
    const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    const { error } = await supabaseAdmin
      .from("tickets")
      .update({ status: "In Progress", escalated_to: null })
      .eq("id", data.ticket_id);
    if (error) throw new Error("Could not reject escalation");
    await supabaseAdmin.from("chat_messages").insert({
      ticket_id: data.ticket_id,
      sender_kind: "system",
      sender_name: "System",
      body: "Escalation rejected. Returned to analyst queue.",
    });
    await writeAudit(supabaseAdmin, {
      ticket_id: data.ticket_id,
      actor_kind: "admin",
      actor_user_id: context.userId,
      actor_name: prof?.full_name ?? "Admin",
      action: "escalation.rejected",
    });
    return { ok: true };
  });

export const generateAIDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ticket_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin
      .from("tickets")
      .select("description, department")
      .eq("id", data.ticket_id)
      .maybeSingle();
    if (!t) throw new Error("Not found");
    return { draft: await aiDraftResponse(t.description, t.department ?? "Operations") };
  });
