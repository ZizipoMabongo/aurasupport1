import { createFileRoute } from "@tanstack/react-router";

// Publicly reachable cron endpoint. pg_cron POSTs here every 5 minutes.
// It auto-approves any resolution_approval task older than 2 hours so that
// tickets don't sit forever waiting for crew acknowledgement.
export const Route = createFileRoute("/api/public/hooks/auto-approve")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { writeAudit } = await import("@/lib/audit.server");
          const { notify } = await import("@/lib/notify.server");

          const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
          const { data: stale } = await supabaseAdmin
            .from("approval_tasks")
            .select("*")
            .eq("status", "pending")
            .lt("created_at", cutoff);

          let approved = 0;
          for (const task of stale ?? []) {
            if (!task.ticket_id) continue;
            const ticketId = task.ticket_id;

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

          return new Response(JSON.stringify({ approved }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[auto-approve] failed", err);
          return new Response(
            JSON.stringify({ error: (err as Error).message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
