import type { Payload } from "payload";
import { callLLM } from "@/lib/agents/_shared/llm";
import { DEFAULT_AUTONOMOUS_FALLBACKS } from "@/lib/agents/_shared/llm/registry";
import { getOptiMateDefaultModels } from "@/lib/agents/_shared/optimate-default-models";
import { loadPinnedMemoryBlock } from "@/lib/agents/optimate-google-ads/memory-loader";
import type { MailModelRequest } from "./model-request";

/**
 * The team's writing-style rules from OptiMate Settings → OptiMate Soul
 * ("Email drafting" + "All" rows), loaded exactly as GmailMate does: soul only,
 * no pinned account facts, so no client data enters the prompt this way
 * (opt-in client facts come only from the request's own CMS facts block).
 */
export async function loadEmailSoulBlock(): Promise<string> {
  try {
    const { text } = await loadPinnedMemoryBlock([], { includePinnedFacts: false, soulAgentKeys: ["email"] });
    if (!text.trim()) return "";
    return `\n\n${text}\n\nThe soul rules above are ABSOLUTE for writing this email. If an instruction conflicts with a soul rule, the soul rule wins. They never authorise adding facts that are not in the email, the user's instruction or the CMS facts block.`;
  } catch (err) {
    // Non-fatal: draft without soul rather than failing the click.
    console.warn("[mail] soul lookup failed:", (err as Error).message);
    return "";
  }
}

/**
 * Runs one Mail model request through the CMS's existing LLM integration
 * (callLLM + the OptiMate Email Assistant model, falling back to the
 * autonomous default, as GmailMate does; no new provider) and writes one
 * mail-ai-requests audit row per call: action, the single Gmail id, the
 * email count, the model and, when client data was opted in, the client id.
 * Email content and client facts are never logged.
 */
export async function runMailModel(args: {
  payload: Payload;
  userId: number;
  request: MailModelRequest;
}): Promise<{ text: string; model: string }> {
  const { payload, userId, request } = args;
  const log = (data: { model: string; status: "ok" | "error"; error?: string }) =>
    payload
      .create({
        collection: "mail-ai-requests",
        overrideAccess: true,
        data: {
          user: userId,
          action: request.action,
          gmailMessageId: request.gmailMessageId ?? "",
          emailCount: request.emailCount,
          client: request.clientId ?? null,
          model: data.model,
          status: data.status,
          error: data.error ?? null,
        },
      } as never)
      .catch(() => undefined);

  const defaults = await getOptiMateDefaultModels(payload);
  const model = defaults.emailAssistantModel ?? defaults.defaultAutonomousModel;
  // Summaries, subject lines and triage are short factual outputs: no drafting soul rules.
  const factual = request.action === "summarise" || request.action === "subject" || request.action === "triage";
  const soul = factual ? "" : await loadEmailSoulBlock();
  try {
    const response = await callLLM({
      model,
      fallbackModels: DEFAULT_AUTONOMOUS_FALLBACKS,
      maxTokens: 2000,
      // Summaries and targeted revisions should stay close to the source; new drafts get some variety.
      temperature: factual || request.revise ? 0.2 : 0.5,
      system: request.system + soul,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: [{ type: "text" as const, text: message.text }],
      })),
    });
    const text = response.message.content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("")
      .trim();
    await log({ model: response.model, status: text ? "ok" : "error", ...(text ? {} : { error: "Empty reply" }) });
    if (!text) throw new Error("The AI returned an empty reply. Please try again.");
    return { text, model: response.model };
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : "AI request failed";
    if (!(err instanceof Error && err.message.startsWith("The AI returned an empty"))) {
      await log({ model, status: "error", error: message });
    }
    throw err;
  }
}
