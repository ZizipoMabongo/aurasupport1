// Server-only ticket routing engine.
// Called after a ticket is created (or when re-routing a queued ticket).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface RoutedResult {
  ticket_id: string;
  assigned_to: string | null;
  matched_rule_id: string | null;
  reason: string;
  queued: boolean;
}

interface TicketRow {
  id: string;
  description: string;
  department: "IT" | "HR" | "Finance" | "Operations" | null;
  subcategory: string | null;
  priority: "Low" | "Medium" | "High" | "Urgent" | null;
  status: string;
  assigned_to: string | null;
  routing_attempts: number | null;
}

interface RuleRow {
  id: string;
  name: string;
  department: "IT" | "HR" | "Finance" | "Operations";
  subcategory: string | null;
  keywords: string[];
  required_skills: string[];
  priority_boost: "Low" | "Medium" | "High" | "Urgent" | null;
  preferred_analyst: string | null;
  is_active: boolean;
  weight: number;
}

function ruleMatches(rule: RuleRow, ticket: TicketRow): number {
  if (!rule.is_active) return 0;
  if (rule.department !== ticket.department) return 0;
  let score = rule.weight;
  if (rule.subcategory && ticket.subcategory && rule.subcategory.toLowerCase() === ticket.subcategory.toLowerCase()) {
    score += 20;
  }
  if (rule.keywords.length > 0) {
    const desc = ticket.description.toLowerCase();
    const hits = rule.keywords.filter((k) => desc.includes(k.toLowerCase())).length;
    if (hits === 0 && rule.subcategory === null) return 0;
    score += hits * 5;
  }
  return score;
}

export async function routeTicket(
  client: SupabaseClient,
  ticketId: string,
): Promise<RoutedResult> {
  const { data: ticket } = await client
    .from("tickets")
    .select("id, description, department, subcategory, priority, status, assigned_to, routing_attempts")
    .eq("id", ticketId)
    .maybeSingle();

  if (!ticket) throw new Error("Ticket not found for routing");
  const t = ticket as TicketRow;

  if (t.assigned_to || !t.department) {
    return { ticket_id: t.id, assigned_to: t.assigned_to, matched_rule_id: null, reason: "Already assigned or no department", queued: false };
  }

  // Find best matching rule
  const { data: rulesRaw } = await client
    .from("routing_rules")
    .select("*")
    .eq("is_active", true)
    .eq("department", t.department);
  const rules = (rulesRaw ?? []) as RuleRow[];

  let bestRule: RuleRow | null = null;
  let bestScore = 0;
  for (const r of rules) {
    const s = ruleMatches(r, t);
    if (s > bestScore) {
      bestScore = s;
      bestRule = r;
    }
  }

  const requiredSkills = bestRule?.required_skills ?? [];
  const preferred = bestRule?.preferred_analyst ?? null;

  // Apply priority boost
  if (bestRule?.priority_boost) {
    const order = { Low: 1, Medium: 2, High: 3, Urgent: 4 } as const;
    if (!t.priority || order[bestRule.priority_boost] > order[t.priority]) {
      await client.from("tickets").update({ priority: bestRule.priority_boost }).eq("id", t.id);
    }
  }

  const { data: chosen } = await client.rpc("pick_analyst_for_ticket", {
    _department: t.department,
    _required_skills: requiredSkills,
    _preferred: preferred,
  });
  const assigneeId = (chosen as string | null) ?? null;

  const attempts = (t.routing_attempts ?? 0) + 1;

  if (assigneeId) {
    await client
      .from("tickets")
      .update({
        assigned_to: assigneeId,
        status: t.status === "New" ? "New" : t.status,
        queued_at: null,
        routing_attempts: attempts,
        last_routed_at: new Date().toISOString(),
      })
      .eq("id", t.id);

    await client.from("automation_events").insert({
      ticket_id: t.id,
      event_type: "auto_assigned",
      matched_rule_id: bestRule?.id ?? null,
      assigned_to: assigneeId,
      reason: bestRule ? `Matched rule "${bestRule.name}" (score ${bestScore})` : "Best-fit analyst by workload/skill",
      details: { attempts, required_skills: requiredSkills, preferred_analyst: preferred },
    });

    await client.from("notifications").insert({
      user_id: assigneeId,
      type: "ticket_assigned",
      ticket_id: t.id,
      message: `New ticket assigned to you (${t.department}${t.subcategory ? " – " + t.subcategory : ""}).`,
    });

    return { ticket_id: t.id, assigned_to: assigneeId, matched_rule_id: bestRule?.id ?? null, reason: "Assigned", queued: false };
  }

  // No analyst available → queue
  await client
    .from("tickets")
    .update({
      queued_at: new Date().toISOString(),
      routing_attempts: attempts,
      last_routed_at: new Date().toISOString(),
    })
    .eq("id", t.id);

  await client.from("automation_events").insert({
    ticket_id: t.id,
    event_type: "queued",
    matched_rule_id: bestRule?.id ?? null,
    reason: `No available analyst in ${t.department}. Queued for retry.`,
    details: { attempts, required_skills: requiredSkills },
  });

  return { ticket_id: t.id, assigned_to: null, matched_rule_id: bestRule?.id ?? null, reason: "Queued — no analyst available", queued: true };
}

// Re-route any ticket queued > 5 minutes ago
export async function rerouteStaleQueued(client: SupabaseClient): Promise<number> {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: stale } = await client
    .from("tickets")
    .select("id")
    .lt("queued_at", cutoff)
    .is("assigned_to", null)
    .in("status", ["New", "In Progress", "Needs Review"]);
  const rows = (stale ?? []) as { id: string }[];
  let rerouted = 0;
  for (const r of rows) {
    const result = await routeTicket(client, r.id);
    if (!result.queued) rerouted++;
  }
  return rerouted;
}
