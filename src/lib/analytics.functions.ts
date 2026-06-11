import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export const getAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: all } = await supabaseAdmin
      .from("tickets")
      .select("*")
      .gte("created_at", weekAgo);
    const rows = all ?? [];

    const today = rows.filter((t) => t.created_at >= since);
    const urgent = rows.filter((t) => t.priority === "Urgent");
    const resolved = rows.filter((t) => t.status === "Resolved");
    const rejected = rows.filter((t) => t.status === "Rejected");
    const open = rows.filter((t) => ["New", "Needs Review", "In Progress", "Escalated"].includes(t.status));
    const escalated = rows.filter((t) => t.status === "Escalated" || t.escalated_by);

    // First response time
    let avgMs = 0;
    const responded = rows.filter((t) => t.first_response_at);
    if (responded.length) {
      avgMs =
        responded.reduce(
          (acc, t) =>
            acc + (new Date(t.first_response_at!).getTime() - new Date(t.created_at).getTime()),
          0,
        ) / responded.length;
    }

    // Resolution time
    let resolveMs = 0;
    const closed = rows.filter((t) => t.resolved_at);
    if (closed.length) {
      resolveMs =
        closed.reduce(
          (acc, t) =>
            acc + (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()),
          0,
        ) / closed.length;
    }

    // SLA targets (minutes) by priority
    const SLA = { Urgent: 15, High: 60, Medium: 240, Low: 1440 } as const;
    let metSla = 0;
    let totalSla = 0;
    for (const t of responded) {
      const target = SLA[(t.priority ?? "Medium") as keyof typeof SLA] ?? 240;
      const mins = (new Date(t.first_response_at!).getTime() - new Date(t.created_at).getTime()) / 60000;
      totalSla++;
      if (mins <= target) metSla++;
    }
    const slaRate = totalSla ? Math.round((metSla / totalSla) * 100) : 0;

    const byDept: Record<string, number> = { IT: 0, HR: 0, Finance: 0, Operations: 0 };
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = { Low: 0, Medium: 0, High: 0, Urgent: 0 };
    const bySub: Record<string, number> = {};
    let guestVol = 0;
    let crewVol = 0;
    for (const t of rows) {
      byDept[t.department ?? "Operations"] = (byDept[t.department ?? "Operations"] ?? 0) + 1;
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      byPriority[t.priority ?? "Medium"] = (byPriority[t.priority ?? "Medium"] ?? 0) + 1;
      bySub[t.subcategory ?? "General"] = (bySub[t.subcategory ?? "General"] ?? 0) + 1;
      if (t.effective_role === "guest") guestVol++;
      else crewVol++;
    }

    // 7-day trend (created vs resolved per day)
    const trendMap = new Map<string, { created: number; resolved: number }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      trendMap.set(key, { created: 0, resolved: 0 });
    }
    for (const t of rows) {
      const k = dayKey(t.created_at);
      const cell = trendMap.get(k);
      if (cell) cell.created++;
    }
    for (const t of closed) {
      const k = dayKey(t.resolved_at!);
      const cell = trendMap.get(k);
      if (cell) cell.resolved++;
    }
    const trend = Array.from(trendMap.entries()).map(([date, v]) => ({
      date: date.slice(5),
      created: v.created,
      resolved: v.resolved,
    }));

    const topIssues = Object.entries(bySub).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return {
      todayCount: today.length,
      avgResponseMs: Math.round(avgMs),
      avgResolveMs: Math.round(resolveMs),
      urgentCount: urgent.length,
      openCount: open.length,
      escalatedCount: escalated.length,
      rejectedCount: rejected.length,
      resolutionRate: rows.length ? Math.round((resolved.length / rows.length) * 100) : 0,
      slaRate,
      totals: { all: rows.length, guest: guestVol, crew: crewVol },
      byDept,
      byStatus,
      byPriority,
      topIssues,
      trend,
    };
  });

export const getReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        from: z.string(),
        to: z.string(),
        department: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("tickets")
      .select("*")
      .gte("created_at", data.from)
      .lte("created_at", data.to);
    if (data.department && data.department !== "all")
      q = q.eq("department", data.department as "IT" | "HR" | "Finance" | "Operations");
    const { data: rows } = await q;
    const tickets = rows ?? [];

    const byDept: Record<string, number> = { IT: 0, HR: 0, Finance: 0, Operations: 0 };
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = { Low: 0, Medium: 0, High: 0, Urgent: 0 };
    const bySub: Record<string, number> = {};
    let guest = 0;
    let crew = 0;
    let resolved = 0;
    let rejected = 0;
    let escalated = 0;
    let firstResponseSumMs = 0;
    let firstResponseCount = 0;
    let resolveSumMs = 0;
    let resolveCount = 0;

    for (const t of tickets) {
      byDept[t.department ?? "Operations"] = (byDept[t.department ?? "Operations"] ?? 0) + 1;
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      byPriority[t.priority ?? "Medium"] = (byPriority[t.priority ?? "Medium"] ?? 0) + 1;
      bySub[t.subcategory ?? "General"] = (bySub[t.subcategory ?? "General"] ?? 0) + 1;
      if (t.effective_role === "guest") guest++;
      else crew++;
      if (t.status === "Resolved") resolved++;
      if (t.status === "Rejected") rejected++;
      if (t.status === "Escalated" || t.escalated_by) escalated++;
      if (t.first_response_at) {
        firstResponseSumMs +=
          new Date(t.first_response_at).getTime() - new Date(t.created_at).getTime();
        firstResponseCount++;
      }
      if (t.resolved_at) {
        resolveSumMs +=
          new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime();
        resolveCount++;
      }
    }
    const topIssues = Object.entries(bySub).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const avgResponseMin = firstResponseCount
      ? Math.round((firstResponseSumMs / firstResponseCount / 60000) * 10) / 10
      : 0;
    const avgResolveHr = resolveCount
      ? Math.round((resolveSumMs / resolveCount / 3600000) * 10) / 10
      : 0;

    let summary = "";
    try {
      const { callAI } = await import("./ai-gateway.server");
      summary = await callAI({
        system:
          "You write concise, board-ready executive summaries for cruise service operations. Write 4 to 6 sentences. Mention volume, top department, response time, resolution rate, and 2 specific recommendations grounded in the data. No emojis, no markdown headings, no bullet symbols.",
        user: `Period: ${data.from.slice(0, 10)} to ${data.to.slice(0, 10)}.
Total tickets: ${tickets.length}. Guest issues: ${guest}. Crew issues: ${crew}.
Resolved: ${resolved}. Rejected: ${rejected}. Escalated: ${escalated}.
Avg first response: ${avgResponseMin} minutes. Avg resolution: ${avgResolveHr} hours.
By department: ${JSON.stringify(byDept)}.
By priority: ${JSON.stringify(byPriority)}.
Top subcategories: ${JSON.stringify(topIssues)}.`,
      });
    } catch (e) {
      summary = `During the period ${data.from.slice(0, 10)} to ${data.to.slice(0, 10)}, the team handled ${tickets.length} tickets (${guest} from guests, ${crew} from crew). ${resolved} were resolved and ${escalated} required escalation. Average first response was ${avgResponseMin} minutes and average resolution time was ${avgResolveHr} hours. The leading department was ${
        Object.entries(byDept).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Operations"
      }.`;
    }

    return {
      tickets,
      kpis: {
        total: tickets.length,
        guest,
        crew,
        resolved,
        rejected,
        escalated,
        avgResponseMin,
        avgResolveHr,
      },
      byDept,
      byStatus,
      byPriority,
      topIssues,
      summary,
    };
  });
