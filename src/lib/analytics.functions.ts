import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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

    let avgMs = 0;
    const responded = rows.filter((t) => t.first_response_at);
    if (responded.length) {
      avgMs =
        responded.reduce(
          (acc, t) =>
            acc +
            (new Date(t.first_response_at!).getTime() -
              new Date(t.created_at).getTime()),
          0,
        ) / responded.length;
    }

    const byDept: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let guestVol = 0;
    let crewVol = 0;
    for (const t of rows) {
      byDept[t.department ?? "Unknown"] = (byDept[t.department ?? "Unknown"] ?? 0) + 1;
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      if (t.effective_role === "guest") guestVol++;
      else crewVol++;
    }

    return {
      todayCount: today.length,
      avgResponseMs: Math.round(avgMs),
      urgentCount: urgent.length,
      resolutionRate: rows.length ? Math.round((resolved.length / rows.length) * 100) : 0,
      totals: { all: rows.length, guest: guestVol, crew: crewVol },
      byDept,
      byStatus,
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
    if (data.department && data.department !== "all") q = q.eq("department", data.department as "IT" | "HR" | "Finance" | "Operations");
    const { data: rows } = await q;
    const tickets = rows ?? [];

    const byDept: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    const bySub: Record<string, number> = {};
    let guest = 0;
    let crew = 0;
    let resolved = 0;
    for (const t of tickets) {
      byDept[t.department ?? "Unknown"] = (byDept[t.department ?? "Unknown"] ?? 0) + 1;
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      bySub[t.subcategory ?? "General"] = (bySub[t.subcategory ?? "General"] ?? 0) + 1;
      if (t.effective_role === "guest") guest++;
      else crew++;
      if (t.status === "Resolved") resolved++;
    }
    const topIssues = Object.entries(bySub).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // AI summary (best effort)
    let summary = "";
    try {
      const { callAI } = await import("./ai-gateway.server");
      summary = await callAI({
        system:
          "You write concise executive summaries for cruise service operations. 4-6 sentences, no emojis.",
        user: `Period: ${data.from} to ${data.to}. Total tickets: ${tickets.length}. Guest issues: ${guest}. Crew issues: ${crew}. Resolved: ${resolved}. By department: ${JSON.stringify(byDept)}. Top subcategories: ${JSON.stringify(topIssues)}. Write an executive summary with key insights and 2 recommendations.`,
      });
    } catch (e) {
      summary = `Total of ${tickets.length} tickets in the period. ${guest} guest issues, ${crew} crew issues. ${resolved} resolved. Top department: ${Object.entries(byDept).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "n/a"}.`;
    }

    return {
      tickets,
      kpis: { total: tickets.length, guest, crew, resolved },
      byDept,
      byStatus,
      topIssues,
      summary,
    };
  });
