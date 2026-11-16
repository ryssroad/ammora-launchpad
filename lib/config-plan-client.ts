import type { ConfigPlan } from "@/lib/types";

type PlanEvent =
  | { type: "step"; label: string }
  | { type: "result"; plan: ConfigPlan }
  | { type: "error"; step: string; message: string };

export async function readConfigPlan(
  account: string,
  onStep: (label: string) => void,
  signal: AbortSignal,
): Promise<ConfigPlan> {
  let response: Response;
  try {
    response = await fetch("/api/plan", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/x-ndjson" },
      body: JSON.stringify({ action: "create-config", account }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) {
      throw Object.assign(new Error("Preview timed out before the public GIWA RPC finished. Retry."), { step: "Preview Config" });
    }
    throw error;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("ndjson")) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw Object.assign(new Error(body.error || `Preview failed (${response.status}).`), { step: "Preview Config" });
  }
  if (!response.body) throw Object.assign(new Error("Preview returned an empty response."), { step: "Preview Config" });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let plan: ConfigPlan | null = null;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as PlanEvent;
    if (event.type === "step") onStep(event.label);
    if (event.type === "error") throw Object.assign(new Error(event.message), { step: event.step });
    if (event.type === "result") plan = event.plan;
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consume(line);
  }
  if (buffer.trim()) consume(buffer);
  if (!plan) throw Object.assign(new Error("The preview ended without a Config plan."), { step: "Preview Config" });
  return plan;
}
