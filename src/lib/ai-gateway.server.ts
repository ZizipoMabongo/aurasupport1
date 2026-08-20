// Server-only Lovable AI gateway helper.
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function callAI(opts: {
  system?: string;
  user: string;
  model?: string;
  json?: boolean;
}): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");

  const messages: ChatMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.user });

  const body: Record<string, unknown> = {
    model: opts.model ?? DEFAULT_MODEL,
    messages,
  };
  if (opts.json) body.response_format = { type: "json_object" };

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`AI gateway ${res.status}: ${text}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

export async function callAIJson<T = unknown>(opts: {
  system?: string;
  user: string;
}): Promise<T> {
  const raw = await callAI({ ...opts, json: true });
  return JSON.parse(raw) as T;
}
