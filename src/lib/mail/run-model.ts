import type { Payload } from "payload";
import { callLLM } from "@/lib/agents/_shared/llm";
import { DEFAULT_AUTONOMOUS_FALLBACKS } from "@/lib/agents/_shared/llm/registry";
import { getOptiMateDefaultModels } from "@/lib/agents/_shared/optimate-default-models";
import type { MailModelRequest } from "./model-request";

/**
 * Runs one Mail model request through the CMS's existing LLM integration
 * (callLLM + the OptiMate default model; no new provider) and writes one
 * mail-ai-requests audit row per call: action, the single Gmail id, the
 * email count (0 or 1) and the model. Email content is never logged.
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
          model: data.model,
          status: data.status,
          error: data.error ?? null,
        },
      } as never)
      .catch(() => undefined);

  const { defaultAutonomousModel } = await getOptiMateDefaultModels(payload);
  try {
    const response = await callLLM({
      model: defaultAutonomousModel,
      fallbackModels: DEFAULT_AUTONOMOUS_FALLBACKS,
      maxTokens: 1500,
      temperature: request.action === "summarise" ? 0.2 : 0.5,
      system: request.system,
      messages: [{ role: "user", content: [{ type: "text", text: request.userText }] }],
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
      await log({ model: defaultAutonomousModel, status: "error", error: message });
    }
    throw err;
  }
}
