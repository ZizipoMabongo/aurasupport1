// Server-only notification helper. Inserts a row into public.notifications
// which is on the supabase_realtime publication, so the browser bell picks it
// up instantly via a postgres_changes subscription.
import type { SupabaseClient } from "@supabase/supabase-js";

export type NotifType =
  | "ticket_assigned"
  | "ticket_response"
  | "ticket_escalated"
  | "escalation_rejected"
  | "ticket_resolved"
  | "ticket_rejected"
  | "approval_requested"
  | "approval_approved"
  | "approval_rejected"
  | "approval_auto_approved";

export async function notify(
  client: SupabaseClient,
  entry: {
    user_id: string | null | undefined;
    type: NotifType;
    message: string;
    ticket_id?: string | null;
  },
): Promise<void> {
  if (!entry.user_id) return;
  const { error } = await client.from("notifications").insert({
    user_id: entry.user_id,
    type: entry.type,
    message: entry.message,
    ticket_id: entry.ticket_id ?? null,
  });
  if (error) console.error("[notify] insert failed:", error);
}

export async function notifyMany(
  client: SupabaseClient,
  userIds: (string | null | undefined)[],
  payload: { type: NotifType; message: string; ticket_id?: string | null },
): Promise<void> {
  const unique = Array.from(new Set(userIds.filter((u): u is string => !!u)));
  if (unique.length === 0) return;
  const rows = unique.map((uid) => ({
    user_id: uid,
    type: payload.type,
    message: payload.message,
    ticket_id: payload.ticket_id ?? null,
  }));
  const { error } = await client.from("notifications").insert(rows);
  if (error) console.error("[notifyMany] insert failed:", error);
}
