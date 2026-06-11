import type { SupabaseClient } from "@supabase/supabase-js";

export interface AuditEntry {
  ticket_id?: string | null;
  actor_kind: "guest" | "crew" | "analyst" | "admin" | "system";
  actor_user_id?: string | null;
  actor_guest_id?: string | null;
  actor_name: string;
  action: string;
  details?: Record<string, unknown>;
}

export async function writeAudit(
  client: SupabaseClient,
  entry: AuditEntry,
): Promise<void> {
  const { error } = await client.from("audit_log").insert({
    ticket_id: entry.ticket_id ?? null,
    actor_kind: entry.actor_kind,
    actor_user_id: entry.actor_user_id ?? null,
    actor_guest_id: entry.actor_guest_id ?? null,
    actor_name: entry.actor_name,
    action: entry.action,
    details: entry.details ?? {},
  });
  if (error) console.error("[audit] write failed:", error);
}
