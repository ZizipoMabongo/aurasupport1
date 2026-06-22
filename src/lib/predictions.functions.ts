import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Dept = "IT" | "HR" | "Finance" | "Operations";
const DEPARTMENTS: Dept[] = ["IT", "HR", "Finance", "Operations"];

interface DayPoint { date: string; count: number; }
interface ForecastPoint { date: string; predicted: number; lower: number; upper: number; }
interface DeptForecast {
  department: Dept;
  history: DayPoint[];
  forecast: ForecastPoint[];
  weeklyAvg: number;
  trend: number; // % week-over-week
  confidence: number;
  slaRisk: "low" | "medium" | "high";
  riskReason: string;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function buildHistory(rows: Array<{ created_at: string; department: string | null }>, days: number) {
  const map = new Map<string, Map<string, number>>();
  for (const d of DEPARTMENTS) map.set(d, new Map());
  const all = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(new Date(Date.now() - i * 86400000));
    all.set(k, 0);
    for (const d of DEPARTMENTS) map.get(d)!.set(k, 0);
  }
  for (const r of rows) {
    const k = r.created_at.slice(0, 10);
    if (!all.has(k)) continue;
    all.set(k, (all.get(k) ?? 0) + 1);
    const dep = (DEPARTMENTS as string[]).includes(r.department ?? "") ? (r.department as Dept) : "Operations";
    map.get(dep)!.set(k, (map.get(dep)!.get(k) ?? 0) + 1);
  }
  return { all, perDept: map };
}

// Forecast: weighted moving average + day-of-week seasonality.
function forecastSeries(series: DayPoint[], horizon: number): { forecast: ForecastPoint[]; confidence: number } {
  const values = series.map((p) => p.count);
  if (values.length < 3) {
    const flat = mean(values);
    const fc: ForecastPoint[] = [];
    for (let i = 1; i <= horizon; i++) {
      const d = new Date(Date.now() + i * 86400000);
      fc.push({ date: dayKey(d), predicted: Math.round(flat), lower: 0, upper: Math.ceil(flat * 1.5) });
    }
    return { forecast: fc, confidence: 0.3 };
  }
  // Day-of-week averages
  const dowSum = new Array(7).fill(0);
  const dowCnt = new Array(7).fill(0);
  for (const p of series) {
    const dow = new Date(p.date + "T00:00:00Z").getUTCDay();
    dowSum[dow] += p.count;
    dowCnt[dow] += 1;
  }
  const dowAvg = dowSum.map((s, i) => (dowCnt[i] ? s / dowCnt[i] : 0));
  const overallAvg = mean(values);
  const sd = std(values);
  // EWMA recent level
  const alpha = 0.4;
  let level = values[0];
  for (let i = 1; i < values.length; i++) level = alpha * values[i] + (1 - alpha) * level;

  const forecast: ForecastPoint[] = [];
  for (let i = 1; i <= horizon; i++) {
    const date = new Date(Date.now() + i * 86400000);
    const dow = date.getUTCDay();
    const seasonal = overallAvg > 0 ? dowAvg[dow] / overallAvg : 1;
    const predicted = Math.max(0, level * (seasonal || 1));
    const margin = 1.96 * sd / Math.sqrt(Math.max(values.length, 4));
    forecast.push({
      date: dayKey(date),
      predicted: Math.round(predicted * 10) / 10,
      lower: Math.max(0, Math.round((predicted - margin) * 10) / 10),
      upper: Math.round((predicted + margin) * 10) / 10,
    });
  }
  // Confidence: higher with more data, lower with high coefficient of variation
  const cv = overallAvg > 0 ? sd / overallAvg : 1;
  const dataScore = Math.min(1, values.length / 30);
  const stabilityScore = Math.max(0, 1 - cv / 1.5);
  const confidence = Math.max(0.2, Math.min(0.95, 0.4 * dataScore + 0.6 * stabilityScore));
  return { forecast, confidence: Math.round(confidence * 100) / 100 };
}

export const generatePrediction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ horizon_days: z.number().int().min(1).max(30).default(7) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { writeAudit } = await import("./audit.server");
    const { logAiDecision } = await import("./ai-risk.server");

    // Authorize: analyst or admin only
    const { data: roleRow } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    const roles = (roleRow ?? []).map((r) => r.role);
    if (!roles.includes("admin") && !roles.includes("analyst")) {
      throw new Error("Only analysts or admins can generate predictions");
    }

    const HISTORY_DAYS = 60;
    const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("tickets")
      .select("created_at, department, priority, resolved_at, first_response_at, status")
      .gte("created_at", since);
    const tickets = rows ?? [];

    const { all, perDept } = buildHistory(tickets, HISTORY_DAYS);

    // Resolution throughput per dept (last 14 days)
    const throughput = new Map<Dept, number>();
    for (const d of DEPARTMENTS) throughput.set(d, 0);
    const cutoff = Date.now() - 14 * 86400000;
    for (const t of tickets) {
      if (!t.resolved_at) continue;
      if (new Date(t.resolved_at).getTime() < cutoff) continue;
      const dep = (DEPARTMENTS as string[]).includes(t.department ?? "") ? (t.department as Dept) : "Operations";
      throughput.set(dep, (throughput.get(dep) ?? 0) + 1);
    }

    const deptForecasts: DeptForecast[] = [];
    for (const dep of DEPARTMENTS) {
      const series: DayPoint[] = Array.from(perDept.get(dep)!.entries()).map(([date, count]) => ({ date, count }));
      const { forecast, confidence } = forecastSeries(series, data.horizon_days);
      const last7 = series.slice(-7).map((p) => p.count);
      const prev7 = series.slice(-14, -7).map((p) => p.count);
      const last7Avg = mean(last7);
      const prev7Avg = mean(prev7);
      const trend = prev7Avg > 0 ? Math.round(((last7Avg - prev7Avg) / prev7Avg) * 100) : 0;
      const forecastTotal = forecast.reduce((a, p) => a + p.predicted, 0);
      const dailyThroughput = (throughput.get(dep) ?? 0) / 14;
      const expectedDaily = forecastTotal / data.horizon_days;
      let slaRisk: "low" | "medium" | "high" = "low";
      let riskReason = "Projected volume is within current resolution capacity.";
      if (dailyThroughput > 0) {
        const ratio = expectedDaily / dailyThroughput;
        if (ratio > 1.25) {
          slaRisk = "high";
          riskReason = `Projected ${expectedDaily.toFixed(1)} tickets/day exceeds ${dep} throughput of ${dailyThroughput.toFixed(1)}/day by ${Math.round((ratio - 1) * 100)}%.`;
        } else if (ratio > 1.0) {
          slaRisk = "medium";
          riskReason = `Projected workload is close to current throughput (${Math.round(ratio * 100)}%).`;
        }
      } else if (expectedDaily > 1) {
        slaRisk = "medium";
        riskReason = "No recent resolution history; SLA risk uncertain.";
      }
      deptForecasts.push({
        department: dep,
        history: series,
        forecast,
        weeklyAvg: Math.round(last7Avg * 10) / 10,
        trend,
        confidence,
        slaRisk,
        riskReason,
      });
    }

    const overallSeries: DayPoint[] = Array.from(all.entries()).map(([date, count]) => ({ date, count }));
    const { forecast: overallForecast, confidence: overallConfidence } = forecastSeries(overallSeries, data.horizon_days);

    // Detect surge: any forecasted day > 1.5x recent average
    const recentAvg = mean(overallSeries.slice(-14).map((p) => p.count));
    const surgeDays = overallForecast.filter((p) => p.predicted > recentAvg * 1.5).map((p) => p.date);

    const slaRiskSummary = {
      high: deptForecasts.filter((d) => d.slaRisk === "high").map((d) => d.department),
      medium: deptForecasts.filter((d) => d.slaRisk === "medium").map((d) => d.department),
      surgeDays,
    };

    const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    const actorName = prof?.full_name ?? "Staff";

    const forecastPayload = JSON.parse(JSON.stringify({
      overall: { history: overallSeries, forecast: overallForecast },
      departments: deptForecasts,
    }));
    const slaRiskPayload = JSON.parse(JSON.stringify(slaRiskSummary));
    const { data: inserted, error } = await supabaseAdmin
      .from("predictions")
      .insert({
        generated_by: context.userId,
        generated_by_name: actorName,
        horizon_days: data.horizon_days,
        history_days: HISTORY_DAYS,
        total_history: tickets.length,
        forecast: forecastPayload,
        confidence: overallConfidence,
        sla_risk: slaRiskPayload,
        notes: surgeDays.length ? `Possible surge: ${surgeDays.join(", ")}` : null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await logAiDecision(supabaseAdmin, {
      decision_type: "prediction",
      prediction_id: inserted.id,
      confidence: overallConfidence,
      input_summary: `${tickets.length} tickets over ${HISTORY_DAYS} days; horizon ${data.horizon_days}d`,
      output_summary: `Overall forecast confidence ${(overallConfidence * 100).toFixed(0)}%. High-risk departments: ${slaRiskSummary.high.join(", ") || "none"}.`,
      explanation: "Forecast uses 60-day history with EWMA level estimation and day-of-week seasonality. SLA risk compares projected daily volume against 14-day resolution throughput per department.",
    });

    await writeAudit(supabaseAdmin, {
      actor_kind: roles.includes("admin") ? "admin" : "analyst",
      actor_user_id: context.userId,
      actor_name: actorName,
      action: "prediction.generated",
      details: { prediction_id: inserted.id, horizon_days: data.horizon_days, confidence: overallConfidence, sla_risk: slaRiskSummary },
    });

    return inserted;
  });

export const listPredictions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("predictions")
      .select("*")
      .order("generated_at", { ascending: false })
      .limit(20);
    return data ?? [];
  });

export const getLatestPrediction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("predictions")
      .select("*")
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  });
