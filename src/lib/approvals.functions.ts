import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// A crew approval task is created whenever an analyst resolves a ticket that
// was originally submitted by a crew member (self or on-behalf-of-guest).
// The requester crew has 2 hours to approve or reject the resolution before
// it is auto-approved by the scheduled auto-approval job.

export const listMyApprovals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("approval_tasks")
      .select("*, tickets:ticket_id(id, ticket_number, department, subcategory, description, status)")
      .eq("assigned_to", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

export const decideApprovalTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        task_id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        reason: z.string().trim().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.decision === "rejected" && (!data.reason || data.reason.length < 3)) {
      throw new Error("Please provide a reason for rejecting the resolution.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeAudit } = await import("./audit.server");
    const { notify } = await import("./notify.server");

    const { data: task } = await supabaseAdmin
      .from("approval_tasks")
      .select("*")
      .eq("id", data.task_id)
      .maybeSingle();
    if (!task) throw new Error("Approval task not found");
    if (!task.ticket_id) throw new Error("Approval task missing ticket");
    if (task.assigned_to !== context.userId) throw new Error("Not your approval to decide");
    if (task.status !== "pending") throw new Error("This approval has already been decided.");
    const ticketId: string = task.ticket_id;


    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const actorName = prof?.full_name ?? "Crew";

    await supabaseAdmin
      .from("approval_tasks")
      .update({
        status: data.decision,
        decision_reason: data.reason ?? null,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    if (data.decision === "approved") {
      await supabaseAdmin
        .from("tickets")
        .update({ status: "Resolved", resolved_at: new Date().toISOString() })
        .eq("id", ticketId);
      await supabaseAdmin.from("chat_messages").insert({
        ticket_id: ticketId,
        sender_kind: "system",
        sender_name: "System",
        body: `Resolution approved by ${actorName}. Ticket is now closed.`,
      });
      await notify(supabaseAdmin, {
        user_id: task.requested_by,
        type: "approval_approved",
        message: "Your resolution was approved and the ticket is now closed.",
        ticket_id: ticketId,
      });
    } else {
      await supabaseAdmin
        .from("tickets")
        .update({ status: "In Progress", resolved_at: null })
        .eq("id", ticketId);
      await supabaseAdmin.from("chat_messages").insert({
        ticket_id: ticketId,
        sender_kind: "system",
        sender_name: "System",
        body: `Resolution rejected by ${actorName}: ${data.reason}`,
      });
      await notify(supabaseAdmin, {
        user_id: task.requested_by,
        type: "approval_rejected",
        message: `Your resolution was rejected: ${data.reason}`,
        ticket_id: ticketId,
      });
    }

    await writeAudit(supabaseAdmin, {
      ticket_id: ticketId,
      actor_kind: "crew",
      actor_user_id: context.userId,
      actor_name: actorName,
      action: data.decision === "approved" ? "resolution.approved" : "resolution.rejected",
      details: { task_id: task.id, reason: data.reason ?? null },
    });

    return { ok: true };
  });

// Cron / manual trigger: auto-approve any approval_task older than 2 hours.
export const autoApproveStale = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { writeAudit } = await import("./audit.server");
  const { notify } = await import("./notify.server");

  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data: stale } = await supabaseAdmin
    .from("approval_tasks")
    .select("*")
    .eq("status", "pending")
    .lt("created_at", cutoff);
  const rows = stale ?? [];
  let approved = 0;
  for (const task of rows) {
    if (!task.ticket_id) continue;
    const ticketId: string = task.ticket_id;

    await supabaseAdmin
      .from("approval_tasks")
      .update({
        status: "approved",
        decision_reason: "Auto-approved after 2 hours without response.",
        decided_at: new Date().toISOString(),
      })
      .eq("id", task.id);
    await supabaseAdmin
      .from("tickets")
      .update({ status: "Resolved", resolved_at: new Date().toISOString() })
      .eq("id", ticketId);
    await supabaseAdmin.from("chat_messages").insert({
      ticket_id: ticketId,
      sender_kind: "system",
      sender_name: "System",
      body: "Resolution auto-approved after 2 hours without a response.",
    });
    await notify(supabaseAdmin, {
      user_id: task.requested_by,
      type: "approval_auto_approved",
      message: "Your resolution was auto-approved (2 hour timeout).",
      ticket_id: ticketId,
    });
    await notify(supabaseAdmin, {
      user_id: task.assigned_to,
      type: "approval_auto_approved",
      message: "An approval you were assigned was auto-approved after 2 hours.",
      ticket_id: ticketId,
    });
    await writeAudit(supabaseAdmin, {
      ticket_id: ticketId,
      actor_kind: "system",
      actor_name: "Auto-approval",
      action: "resolution.auto_approved",
      details: { task_id: task.id },
    });
    approved++;
  }
  return { approved };
});
