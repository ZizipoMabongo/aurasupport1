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

// Keyword fallback when AI fails.
function keywordClassify(text: string, role: EffectiveRole): ClassifiedTicket[] {
  const t = text.toLowerCase();
  const rules: Array<{ kw: string[]; dept: Department; sub: string; gAllowed: boolean }> = [
    { kw: ["wifi", "internet", "tv", "screen", "laptop", "login", "password reset", "app"], dept: "IT", sub: "Connectivity", gAllowed: true },
    { kw: ["payroll", "salary", "schedule", "shift", "hr", "leave", "vacation request"], dept: "HR", sub: "General", gAllowed: false },
    { kw: ["charge", "invoice", "bill", "refund", "payment", "tip", "gratuity"], dept: "Finance", sub: "Billing", gAllowed: true },
    { kw: ["air condition", "ac", "wifi", "leak", "broken", "noise", "cleaning", "towel", "food", "drink", "cabin", "shower"], dept: "Operations", sub: "Maintenance", gAllowed: true },
  ];
  const matches = rules.filter((r) => r.kw.some((k) => t.includes(k)));
  const picks = matches.length ? matches : [{ dept: "Operations" as Department, sub: "General", gAllowed: true }];
  return picks.map((m) => ({
    description: text,
    department: m.dept,
    subcategory: m.sub,
    priority: t.includes("urgent") || t.includes("emergency") ? "Urgent" : t.includes("asap") || t.includes("now") ? "High" : "Medium",
    confidence: 0.5,
    guest_allowed: role === "crew" ? true : m.gAllowed,
    ai_classified: false,
  }));
}

const SYSTEM = `You classify cruise-ship service requests.
Allowed departments: IT, HR, Finance, Operations.
Allowed priorities: Low, Medium, High, Urgent.
If the submission contains multiple distinct issues, split them into separate tickets.
"guest_allowed" must be false for staff-only matters (payroll, HR personnel, internal finance, crew scheduling) and true for issues a guest could legitimately request.
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
      description: t.description || rawText,
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
      system:
        "You draft brief, professional, warm responses from a cruise service team. 2-4 sentences. No emojis.",
      user: `Department: ${dept}\nIssue: ${ticketDesc}\nWrite a draft response acknowledging the issue and outlining the next step.`,
    });
    return text.trim();
  } catch (e) {
    console.error("[ai-draft] failed:", e);
    return "Thank you for reaching out. Our team has received your request and will follow up shortly with an update.";
  }
}
