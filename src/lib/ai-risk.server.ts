import type { SupabaseClient } from "@supabase/supabase-js";

// Simple keyword-based scanner for potentially biased, inappropriate,
// or high-risk AI outputs. Used to flag decisions for human review.
const BIAS_PATTERNS: Array<{ kind: string; rx: RegExp }> = [
  { kind: "demographic", rx: /\b(race|ethnic|religion|gender|nationality|disabled|elderly|young people|old people)\b/i },
  { kind: "sensitive", rx: /\b(lawsuit|sue|attorney|lawyer|medical emergency|injury|death|harassment|assault)\b/i },
  { kind: "inappropriate", rx: /\b(stupid|idiot|incompetent|useless|garbage|terrible service)\b/i },
  { kind: "financial-risk", rx: /\b(refund.*(\$|usd|eur)\s*\d{3,}|chargeback|fraud)\b/i },
];

const LOW_CONFIDENCE_THRESHOLD = 0.6;

export interface AiDecisionInput {
  decision_type: "classification" | "response" | "routing" | "prediction";
  ticket_id?: string | null;
  prediction_id?: string | null;
  model?: string;
  confidence: number;
  input_summary: string;
  output_summary: string;
  explanation?: string;
}

export interface LoggedDecision {
  id: string;
  flags: string[];
  needs_review: boolean;
}

export function scanForFlags(text: string): string[] {
  const flags = new Set<string>();
  for (const p of BIAS_PATTERNS) {
    if (p.rx.test(text)) flags.add(p.kind);
  }
  return Array.from(flags);
}

export async function logAiDecision(
  client: SupabaseClient,
  input: AiDecisionInput,
): Promise<LoggedDecision | null> {
  const combined = `${input.input_summary}\n${input.output_summary}`;
  const flags = scanForFlags(combined);
  const needs_review = input.confidence < LOW_CONFIDENCE_THRESHOLD || flags.length > 0;

  const { data, error } = await client
    .from("ai_decisions")
    .insert({
      decision_type: input.decision_type,
      ticket_id: input.ticket_id ?? null,
      prediction_id: input.prediction_id ?? null,
      model: input.model ?? "google/gemini-3-flash-preview",
      confidence: Number(Math.max(0, Math.min(1, input.confidence)).toFixed(3)),
      input_summary: input.input_summary.slice(0, 1000),
      output_summary: input.output_summary.slice(0, 2000),
      explanation: input.explanation ?? null,
      flags: flags,
      needs_review,
      review_status: needs_review ? "pending" : "auto-approved",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[ai-risk] log failed:", error);
    return null;
  }
  return { id: data.id, flags, needs_review };
}
