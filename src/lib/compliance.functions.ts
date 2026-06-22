import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listAiDecisions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        scope: z.enum(["all", "queue", "reviewed", "flagged"]).optional(),
        decision_type: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("ai_decisions").select("*").order("created_at", { ascending: false }).limit(data.limit);
    if (data.scope === "queue") q = q.eq("needs_review", true).eq("review_status", "pending");
    if (data.scope === "reviewed") q = q.in("review_status", ["approved", "overridden", "rejected"]);
    if (data.scope === "flagged") q = q.neq("flags", "[]");
    if (data.decision_type && data.decision_type !== "all") q = q.eq("decision_type", data.decision_type);
    const { data: rows } = await q;
    return rows ?? [];
  });

export const reviewAiDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["approve", "override", "reject"]),
        comment: z.string().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeAudit } = await import("./audit.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    const actorName = prof?.full_name ?? "Reviewer";
    const status = data.action === "approve" ? "approved" : data.action === "override" ? "overridden" : "rejected";
    const { error } = await supabaseAdmin
      .from("ai_decisions")
      .update({
        review_status: status,
        reviewed_by: context.userId,
        reviewed_by_name: actorName,
        reviewer_comment: data.comment,
        reviewed_at: new Date().toISOString(),
        needs_review: false,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor_kind: "analyst",
      actor_user_id: context.userId,
      actor_name: actorName,
      action: `ai_review.${data.action}`,
      details: { decision_id: data.id, comment: data.comment },
    });
    return { ok: true };
  });

export const getRiskReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ from: z.string(), to: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeAudit } = await import("./audit.server");
    const { data: rows } = await supabaseAdmin
      .from("ai_decisions")
      .select("*")
      .gte("created_at", data.from)
      .lte("created_at", data.to)
      .order("created_at", { ascending: false });
    const decisions = rows ?? [];

    const byType: Record<string, number> = {};
    const confidenceBuckets = { "0-0.4": 0, "0.4-0.6": 0, "0.6-0.8": 0, "0.8-1.0": 0 };
    const flagCounts: Record<string, number> = {};
    const reviewOutcomes = { approved: 0, overridden: 0, rejected: 0, pending: 0, "auto-approved": 0 };
    const overrides: Array<{ id: string; decision_type: string; comment: string | null; reviewer: string | null; created_at: string }> = [];
    const highRisk: typeof decisions = [];
    let confSum = 0;

    for (const d of decisions) {
      byType[d.decision_type] = (byType[d.decision_type] ?? 0) + 1;
      const c = Number(d.confidence ?? 0);
      confSum += c;
      if (c < 0.4) confidenceBuckets["0-0.4"]++;
      else if (c < 0.6) confidenceBuckets["0.4-0.6"]++;
      else if (c < 0.8) confidenceBuckets["0.6-0.8"]++;
      else confidenceBuckets["0.8-1.0"]++;
      const flags = Array.isArray(d.flags) ? (d.flags as string[]) : [];
      for (const f of flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
      if (flags.length > 0 || c < 0.4) highRisk.push(d);
      const status = (d.review_status as keyof typeof reviewOutcomes) ?? "pending";
      if (status in reviewOutcomes) reviewOutcomes[status]++;
      if (d.review_status === "overridden") {
        overrides.push({
          id: d.id,
          decision_type: d.decision_type,
          comment: d.reviewer_comment,
          reviewer: d.reviewed_by_name,
          created_at: d.created_at,
        });
      }
    }

    const avgConfidence = decisions.length ? Math.round((confSum / decisions.length) * 100) : 0;
    const reviewRate = decisions.length
      ? Math.round(((reviewOutcomes.approved + reviewOutcomes.overridden + reviewOutcomes.rejected) /
          Math.max(1, decisions.filter((d) => d.needs_review || d.review_status !== "auto-approved").length)) * 100)
      : 0;
    const flagRate = decisions.length ? Math.round((highRisk.length / decisions.length) * 100) : 0;
    const complianceStatus = flagRate > 15 || avgConfidence < 60 ? "Attention required" : flagRate > 5 ? "Monitor" : "Healthy";

    const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    await writeAudit(supabaseAdmin, {
      actor_kind: "admin",
      actor_user_id: context.userId,
      actor_name: prof?.full_name ?? "Admin",
      action: "ai_risk_report.generated",
      details: { from: data.from, to: data.to, total: decisions.length },
    });

    return {
      period: { from: data.from, to: data.to },
      totals: {
        total: decisions.length,
        flagged: highRisk.length,
        avgConfidence,
        flagRate,
        reviewRate,
        complianceStatus,
      },
      byType,
      confidenceBuckets,
      flagCounts,
      reviewOutcomes,
      overrides: overrides.slice(0, 50),
      highRisk: highRisk.slice(0, 50),
      transparency:
        "AI decisions are generated by Lovable AI (Gemini 3 Flash Preview) using structured prompts. Each decision records the input summary, model output, confidence score, and an explanation of the reasoning approach. Decisions below 60% confidence or matching bias/sensitivity patterns are automatically routed to the Human Review Queue. Reviewers can approve, override, or reject any decision and their comments are preserved in the audit trail.",
    };
  });

export const logRiskReportEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ action: z.enum(["previewed", "downloaded"]), period_from: z.string(), period_to: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeAudit } = await import("./audit.server");
    const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    await writeAudit(supabaseAdmin, {
      actor_kind: "admin",
      actor_user_id: context.userId,
      actor_name: prof?.full_name ?? "Admin",
      action: `ai_risk_report.${data.action}`,
      details: { from: data.period_from, to: data.period_to },
    });
    return { ok: true };
  });
