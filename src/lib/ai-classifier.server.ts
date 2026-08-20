import { callAIJson } from "./ai-gateway.server";
import type { Department, EffectiveRole, Priority } from "./types";

export interface ClassifiedTicket {
  description: string;
  department: Department;
  subcategory: string;
  priority: Priority;
  confidence: number;
  guest_allowed: boolean;
  ai_classified: boolean;
}

interface AIResp {
  tickets: Array<{
    description: string;
    department: string;
    subcategory: string;
    priority: string;
    confidence: number;
    guest_allowed: boolean;
  }>;
}

const DEPTS: Department[] = ["IT", "HR", "Finance", "Operations"];
const PRIOS: Priority[] = ["Low", "Medium", "High", "Urgent"];

function norm<T extends string>(v: string, allowed: T[], fallback: T): T {
  const hit = allowed.find((a) => a.toLowerCase() === v?.toLowerCase());
  return hit ?? fallback;
}

// Naive sentence/conjunction splitter used by the keyword fallback so that
// a single submission with multiple issues still produces multiple tickets.
function splitIssues(text: string): string[] {
  const parts = text
    .split(/(?:\.|;|\n|\band\b|\balso\b|\bplus\b|,\s*(?=the\b|my\b|i\b))/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 4);
  return parts.length ? parts : [text];
}

function keywordClassify(text: string, role: EffectiveRole): ClassifiedTicket[] {
  const rules: Array<{ kw: string[]; dept: Department; sub: string; gAllowed: boolean }> = [
    { kw: ["wifi", "internet", "tv", "screen", "laptop", "login", "password", "app", "device"], dept: "IT", sub: "Connectivity", gAllowed: true },
    { kw: ["payroll", "salary", "shift", "schedule", "hr", "leave", "vacation"], dept: "HR", sub: "Personnel", gAllowed: false },
    { kw: ["charge", "invoice", "bill", "refund", "payment", "tip", "gratuity"], dept: "Finance", sub: "Billing", gAllowed: true },
    { kw: ["air condition", " ac ", "leak", "broken", "noise", "cleaning", "towel", "food", "drink", "cabin", "shower", "bed"], dept: "Operations", sub: "Cabin maintenance", gAllowed: true },
  ];

  const issues = splitIssues(text);
  const tickets: ClassifiedTicket[] = [];
  for (const issue of issues) {
    const lower = ` ${issue.toLowerCase()} `;
    const match = rules.find((r) => r.kw.some((k) => lower.includes(k)));
    const m = match ?? { dept: "Operations" as Department, sub: "General", gAllowed: true };
    tickets.push({
      description: issue,
      department: m.dept,
      subcategory: m.sub,
      priority: /urgent|emergency/i.test(issue) ? "Urgent" : /asap|now|immediately/i.test(issue) ? "High" : "Medium",
      confidence: 0.5,
      guest_allowed: role === "crew" ? true : m.gAllowed,
      ai_classified: false,
    });
  }
  // De-duplicate by (department, subcategory) when the splitter over-segments
  const seen = new Set<string>();
  const deduped: ClassifiedTicket[] = [];
  for (const t of tickets) {
    const key = `${t.department}::${t.subcategory}`;
    if (seen.has(key)) {
      const existing = deduped.find((d) => `${d.department}::${d.subcategory}` === key)!;
      existing.description = `${existing.description} ${t.description}`.trim();
      continue;
    }
    seen.add(key);
    deduped.push(t);
  }
  return deduped;
}

const SYSTEM = `You classify cruise-ship service requests and split them when needed.

Rules:
- Allowed departments: IT, HR, Finance, Operations.
- Allowed priorities: Low, Medium, High, Urgent.
- If a single submission contains MULTIPLE distinct issues (e.g. "the WiFi is down AND the AC is broken AND there's a charge I don't recognize"), you MUST return one ticket per issue.
- For EACH ticket, the "description" field MUST be a focused, self-contained rewrite covering ONLY that single issue in 1-3 clear sentences. Do NOT copy the full original submission verbatim into every ticket — each ticket's description must describe only its own issue.
- "guest_allowed" must be false for staff-only matters (payroll, HR personnel, internal finance, crew scheduling) and true for issues a guest could legitimately request.
- "subcategory" should be a short noun phrase (e.g. "Connectivity", "Billing dispute", "Cabin maintenance").

Return JSON in the EXACT shape:
{"tickets":[{"description":"...","department":"...","subcategory":"...","priority":"...","confidence":0.0-1.0,"guest_allowed":true|false}]}`;

export async function classifySubmission(
  rawText: string,
  effectiveRole: EffectiveRole,
): Promise<ClassifiedTicket[]> {
  try {
    const resp = await callAIJson<AIResp>({
      system: SYSTEM,
      user: `Effective role: ${effectiveRole}\nSubmission: ${rawText}`,
    });
    if (!resp?.tickets?.length) throw new Error("empty");
    return resp.tickets.map((t) => ({
      description: (t.description || rawText).trim(),
      department: norm(t.department, DEPTS, "Operations"),
      subcategory: t.subcategory || "General",
      priority: norm(t.priority, PRIOS, "Medium"),
      confidence: Math.max(0, Math.min(1, Number(t.confidence) || 0.5)),
      guest_allowed: Boolean(t.guest_allowed),
      ai_classified: true,
    }));
  } catch (e) {
    console.error("[ai-classifier] falling back to keyword:", e);
    return keywordClassify(rawText, effectiveRole);
  }
}

export async function aiDraftResponse(ticketDesc: string, dept: string): Promise<string> {
  try {
    const text = await (await import("./ai-gateway.server")).callAI({
      system: `You are a warm, professional cruise-ship guest service representative writing a reply to a guest or crew member.

Style rules:
- Sound human, empathetic and natural — like a real concierge, not a chatbot.
- Acknowledge the specific issue in the opening line (do not use generic openings like "Dear guest" or "Hello").
- Apologize briefly when appropriate.
- State concretely what the ${dept} team will do next and a realistic timeframe (for example "within 15 minutes", "shortly", "within one billing cycle").
- 2 to 4 sentences. No bullet points, no emojis, no signatures, no placeholders like [Name].

Example of the tone we want:
"Thank you for bringing this connectivity issue to our attention. We apologize for the interruption to your service and have opened a technical support ticket for your cabin. A member of our IT team will visit your stateroom shortly to test the signal strength and reset your local access point."`,
      user: `Issue reported: "${ticketDesc}"\nDepartment handling it: ${dept}\n\nWrite the reply now.`,
    });
    return text.trim();
  } catch (e) {
    console.error("[ai-draft] failed:", e);
    return "Thank you for bringing this to our attention. We've logged your request and a member of our team will follow up with you shortly to take care of it.";
  }
}
