import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.role !== "admin") throw new Error("Admin only");
}

// ---------- Admin overview: critical alerts + staffing + automation metrics ----------
export const getAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [ticketsRes, autoRes, decisionsRes, approvalsRes, analystRolesRes] = await Promise.all([
      supabaseAdmin
        .from("tickets")
        .select("id, ticket_number, status, priority, department, effective_role, created_at, assigned_to, escalated_to, escalation_reason, description")
        .gte("created_at", weekAgo),
      supabaseAdmin.from("automation_events").select("event_type, created_at").gte("created_at", weekAgo),
      supabaseAdmin.from("ai_decisions").select("id, needs_review, review_status, flags, created_at").gte("created_at", weekAgo),
      supabaseAdmin.from("approval_tasks").select("id, status").eq("status", "pending"),
      supabaseAdmin.from("user_roles").select("user_id").eq("role", "analyst"),
    ]);

    const tickets = ticketsRes.data ?? [];
    const analystIds = (analystRolesRes.data ?? []).map((r) => r.user_id);
    const [presenceRes, aprofRes] = await Promise.all([
      analystIds.length
        ? supabaseAdmin.from("analyst_presence").select("*").in("user_id", analystIds)
        : Promise.resolve({ data: [] as any[] }),
      analystIds.length
        ? supabaseAdmin.from("analyst_profiles").select("*").in("user_id", analystIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const now = Date.now();
    const isOnline = (p: any) =>
      p?.status === "online" && p?.last_seen_at && new Date(p.last_seen_at).getTime() > now - 3 * 60_000;
    const presenceMap = new Map((presenceRes.data ?? []).map((p: any) => [p.user_id, p]));
    const aprofMap = new Map((aprofRes.data ?? []).map((p: any) => [p.user_id, p]));

    const openStatuses = new Set(["New", "In Progress", "Needs Review", "Escalated"]);
    const openTickets = tickets.filter((t) => openStatuses.has(t.status));

    // Load per-analyst workload (only open counts)
    const workload = new Map<string, number>();
    for (const t of openTickets) {
      if (t.assigned_to) workload.set(t.assigned_to, (workload.get(t.assigned_to) ?? 0) + 1);
    }

    const analysts = analystIds.map((id) => {
      const ap = aprofMap.get(id);
      const capacity = ap?.max_concurrent ?? 5;
      const load = workload.get(id) ?? 0;
      return {
        user_id: id,
        online: isOnline(presenceMap.get(id)),
        department: ap?.department ?? null,
        capacity,
        load,
        util: capacity ? load / capacity : 0,
      };
    });

    // Critical alerts
    const alerts: Array<{
      severity: "critical" | "warning";
      title: string;
      detail: string;
      ticket_id?: string;
    }> = [];

    for (const t of openTickets) {
      const ageMs = now - new Date(t.created_at).getTime();
      if (t.priority === "Urgent" && !t.assigned_to && t.status !== "Escalated") {
        alerts.push({
          severity: "critical",
          title: `Urgent ticket unassigned: ${t.ticket_number}`,
          detail: t.description?.slice(0, 120) ?? "",
          ticket_id: t.id,
        });
      } else if (t.status === "Escalated" && !t.escalated_to) {
        alerts.push({
          severity: "critical",
          title: `Escalated ticket needs admin: ${t.ticket_number}`,
          detail: t.escalation_reason?.slice(0, 120) ?? "",
          ticket_id: t.id,
        });
      } else if (t.priority === "Urgent" && ageMs > 60 * 60_000) {
        alerts.push({
          severity: "warning",
          title: `Urgent ticket open >1h: ${t.ticket_number}`,
          detail: t.description?.slice(0, 120) ?? "",
          ticket_id: t.id,
        });
      }
    }

    // Automation events grouped
    const events = autoRes.data ?? [];
    const eventCounts: Record<string, number> = {};
    for (const e of events) eventCounts[e.event_type] = (eventCounts[e.event_type] ?? 0) + 1;
    const eventsToday = events.filter((e) => e.created_at >= dayAgo).length;

    const decisions = decisionsRes.data ?? [];
    const decisionsFlagged = decisions.filter((d) => d.needs_review).length;
    const decisionsPending = decisions.filter((d) => d.review_status === "pending").length;

    // Staffing recommendation
    const openByDept: Record<string, number> = { IT: 0, HR: 0, Finance: 0, Operations: 0 };
    for (const t of openTickets) {
      const d = t.department ?? "Operations";
      openByDept[d] = (openByDept[d] ?? 0) + 1;
    }
    const capacityByDept: Record<string, { cap: number; online: number }> = {
      IT: { cap: 0, online: 0 },
      HR: { cap: 0, online: 0 },
      Finance: { cap: 0, online: 0 },
      Operations: { cap: 0, online: 0 },
    };
    for (const a of analysts) {
      const d = a.department ?? "Operations";
      if (!capacityByDept[d]) capacityByDept[d] = { cap: 0, online: 0 };
      capacityByDept[d].cap += a.capacity;
      if (a.online) capacityByDept[d].online += 1;
    }
    const staffing = Object.keys(openByDept).map((d) => {
      const open = openByDept[d] ?? 0;
      const c = capacityByDept[d] ?? { cap: 0, online: 0 };
      let recommendation = "OK";
      let severity: "ok" | "warn" | "critical" = "ok";
      if (c.online === 0 && open > 0) {
        recommendation = "No analyst online — assign coverage";
        severity = "critical";
      } else if (open > c.cap * 0.8 && c.cap > 0) {
        recommendation = "Near capacity — add an analyst";
        severity = "warn";
      } else if (c.cap === 0) {
        recommendation = "No analyst profile — configure staff";
        severity = "warn";
      }
      return { department: d, open, capacity: c.cap, online: c.online, recommendation, severity };
    });

    return {
      alerts: alerts.slice(0, 20),
      analysts,
      staffing,
      automation: {
        eventsWeek: events.length,
        eventsToday,
        eventCounts,
        decisionsWeek: decisions.length,
        decisionsFlagged,
        decisionsPending,
        pendingApprovals: (approvalsRes.data ?? []).length,
      },
      openCount: openTickets.length,
    };
  });

// ---------- Audit log viewer ----------
export const listAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        action: z.string().optional(),
        actor_kind: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.action && data.action !== "all") q = q.eq("action", data.action);
    if (data.actor_kind && data.actor_kind !== "all")
      q = q.eq("actor_kind", data.actor_kind as "guest" | "crew" | "analyst" | "admin" | "system");
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- All pending approvals (admin oversight) ----------
export const listAllApprovals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("approval_tasks")
      .select("*, tickets:ticket_id(id, ticket_number, department, subcategory, description, status)")
      .order("created_at", { ascending: false })
      .limit(200);
    const ids = new Set<string>();
    for (const r of data ?? []) {
      if (r.assigned_to) ids.add(r.assigned_to);
      if (r.requested_by) ids.add(r.requested_by);
    }
    let profs: any[] = [];
    if (ids.size) {
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", Array.from(ids));
      profs = p ?? [];
    }
    const nameMap = new Map(profs.map((p) => [p.id, p.full_name]));
    return (data ?? []).map((r) => ({
      ...r,
      assigned_to_name: r.assigned_to ? nameMap.get(r.assigned_to) ?? null : null,
      requested_by_name: r.requested_by ? nameMap.get(r.requested_by) ?? null : null,
    }));
  });

// ---------- Batch ticket actions ----------
const BatchInput = z.object({
  ticket_ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(["reassign", "resolve", "reject", "close"]),
  assigned_to: z.string().uuid().optional().nullable(),
  reason: z.string().trim().max(1000).optional(),
});

export const batchTicketAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BatchInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeAudit } = await import("./audit.server");
    const { notify } = await import("./notify.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const actorName = prof?.full_name ?? "Admin";

    const { data: tickets } = await supabaseAdmin
      .from("tickets")
      .select("*")
      .in("id", data.ticket_ids);
    const rows = tickets ?? [];

    let ok = 0;
    const errors: Array<{ ticket_id: string; error: string }> = [];

    for (const t of rows) {
      try {
        if (data.action === "reassign") {
          if (!data.assigned_to) throw new Error("Missing analyst");
          await supabaseAdmin
            .from("tickets")
            .update({ assigned_to: data.assigned_to, status: t.status === "New" ? "In Progress" : t.status })
            .eq("id", t.id);
          await writeAudit(supabaseAdmin, {
            ticket_id: t.id,
            actor_kind: "admin",
            actor_user_id: context.userId,
            actor_name: actorName,
            action: "ticket.reassigned",
            details: { assigned_to: data.assigned_to, batch: true },
          });
          await notify(supabaseAdmin, {
            user_id: data.assigned_to,
            type: "ticket_assigned",
            message: `Ticket ${t.ticket_number} was assigned to you by ${actorName}.`,
            ticket_id: t.id,
          });
        } else if (data.action === "resolve" || data.action === "close") {
          if (t.status === "Resolved" || t.status === "Rejected") {
            throw new Error("Already closed");
          }
          if (t.status !== "Escalated" && t.escalated_to !== context.userId) {
            throw new Error("Only escalated tickets can be resolved by admin");
          }
          await supabaseAdmin
            .from("tickets")
            .update({ status: "Resolved", resolved_at: new Date().toISOString() })
            .eq("id", t.id);
          await supabaseAdmin.from("chat_messages").insert({
            ticket_id: t.id,
            sender_kind: "system",
            sender_name: "System",
            body: `Ticket resolved by ${actorName} (batch action).`,
          });
          await writeAudit(supabaseAdmin, {
            ticket_id: t.id,
            actor_kind: "admin",
            actor_user_id: context.userId,
            actor_name: actorName,
            action: "ticket.resolved",
            details: { batch: true },
          });
          if (t.submitter_user_id && t.submitter_user_id !== context.userId) {
            await notify(supabaseAdmin, {
              user_id: t.submitter_user_id,
              type: "ticket_resolved",
              message: `Ticket ${t.ticket_number} was resolved by ${actorName}.`,
              ticket_id: t.id,
            });
          }
        } else if (data.action === "reject") {
          if (!data.reason || data.reason.length < 3) throw new Error("Reason required");
          if (t.status === "Resolved" || t.status === "Rejected") throw new Error("Already closed");
          await supabaseAdmin
            .from("tickets")
            .update({
              status: "Rejected",
              rejection_reason: data.reason,
              resolved_at: new Date().toISOString(),
            })
            .eq("id", t.id);
          await supabaseAdmin.from("chat_messages").insert({
            ticket_id: t.id,
            sender_kind: "system",
            sender_name: "System",
            body: `Ticket rejected (batch): ${data.reason}`,
          });
          await writeAudit(supabaseAdmin, {
            ticket_id: t.id,
            actor_kind: "admin",
            actor_user_id: context.userId,
            actor_name: actorName,
            action: "ticket.rejected",
            details: { reason: data.reason, batch: true },
          });
        }
        ok += 1;
      } catch (e) {
        errors.push({ ticket_id: t.id, error: (e as Error).message });
      }
    }
    return { ok, errors };
  });
