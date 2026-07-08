// Server-side high-risk detector — flags tickets that must be auto-escalated
// straight to the admin queue (safety, legal, financial risk, medical, etc.).
import type { ClassifiedTicket } from "./ai-classifier.server";

const RISK_PATTERNS: Array<{ label: string; rx: RegExp }> = [
  { label: "medical", rx: /\b(medical|injur(y|ed)|bleeding|unconscious|allergic reaction|chest pain|cardiac|overdose|ambulance)\b/i },
  { label: "safety", rx: /\b(fire|smoke|flood(ing)?|gas leak|electrical hazard|overboard|drown(ing)?|assault|harass(ment|ed)|threat(en(ed|ing))?)\b/i },
  { label: "legal", rx: /\b(lawsuit|attorney|lawyer|sue|litigation|discrimination|liable|liability|refuse to (leave|pay))\b/i },
  { label: "financial", rx: /\b(chargeback|fraud(ulent)?|stolen (card|payment)|unauthorised charge|unauthorized charge|refund\s+(usd|eur|\$)?\s*\d{3,})\b/i },
  { label: "child-safety", rx: /\b(missing child|lost child|unattended minor|child (safety|abuse))\b/i },
];

export interface RiskAssessment {
  isHighRisk: boolean;
  reasons: string[];
}

export function assessRisk(text: string, classified: ClassifiedTicket): RiskAssessment {
  const reasons = new Set<string>();
  for (const p of RISK_PATTERNS) if (p.rx.test(text)) reasons.add(p.label);
  const hasKeyword = reasons.size > 0;
  if (hasKeyword && classified.priority === "Urgent") reasons.add("urgent-priority");
  // Auto-escalate only when a real risk keyword is present.
  return { isHighRisk: hasKeyword, reasons: Array.from(reasons) };
}
