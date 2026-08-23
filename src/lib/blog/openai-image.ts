/**
 * Image generation over the Codex (ChatGPT subscription) OAuth path.
 *
 * ChatGPT OAuth tokens are rejected by `api.openai.com/v1/images/*` (they lack
 * the `api.model.images.request` scope), but they are accepted by the private
 * Codex Responses endpoint, which exposes the built-in `image_generation` tool
 * and routes it to gpt-image-2 internally. This is the same mechanism
 * gg-framework's `generate_image` tool uses
 * (`packages/ggcoder/src/tools/generate-image.ts` @ v0.53.4), reusing the Codex
 * OAuth credential this CMS already stores for chat.
 *
 * ToS grey area, same as the Codex chat path: OpenAI can revoke tokens or
 * change the endpoint at any time, and it burns ChatGPT-plan Codex quota rather
 * than API credits. Every failure here is surfaced to the caller so the blog UI
 * can offer the billed API-key path as an explicit, confirmed fallback — it
 * never falls through silently.
 */

import { resolveCredential } from "@/lib/agents/_shared/llm/auth/resolver";

const CODEX_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
/** Routing model that exposes the image_generation Responses tool. */
const IMAGE_GEN_MODEL = "gpt-5.5";

export class CodexImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodexImageError";
  }
}

export interface CodexImageOptions {
  /** gpt-image-2 size string; both edges must be multiples of 16. */
  size?: string;
  quality?: "low" | "medium" | "high" | "auto";
  /** Abort signal so a cancelled request stops the upstream stream too. */
  signal?: AbortSignal;
}

/**
 * Generate a single image from `prompt` using the Codex OAuth credential.
 * Throws CodexImageError when OAuth is not connected, the endpoint rejects the
 * request, or the stream yields no image (e.g. moderation block).
 */
export async function generateImageViaCodexOAuth(
  prompt: string,
  opts: CodexImageOptions = {},
): Promise<Buffer> {
  let authHeader: Record<string, string>;
  try {
    const resolved = await resolveCredential("openai-codex");
    if (resolved.source !== "oauth") {
      throw new Error("Codex credential is not an OAuth credential.");
    }
    authHeader = resolved.authHeader;
  } catch (err) {
    throw new CodexImageError(
      `ChatGPT (Codex) OAuth is not available: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const imageTool: Record<string, unknown> = {
    type: "image_generation",
    action: "generate",
    output_format: "png",
  };
  if (opts.size) imageTool.size = opts.size;
  if (opts.quality) imageTool.quality = opts.quality;

  const response = await fetch(CODEX_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      originator: "ggcoder",
    },
    body: JSON.stringify({
      model: IMAGE_GEN_MODEL,
      store: false,
      // The Codex backend only speaks SSE; a non-streaming request is rejected.
      stream: true,
      instructions: "Generate the image the user requested.",
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
      tools: [imageTool],
      tool_choice: "auto",
      reasoning: { effort: "low" },
    }),
    signal: opts.signal,
  });

  if (!response.ok) {
    const text = await response.text();
    let detail = text.slice(0, 500);
    try {
      const parsed = JSON.parse(text) as {
        detail?: string;
        error?: { message?: string };
      };
      if (parsed.detail) detail = parsed.detail;
      else if (parsed.error?.message) detail = parsed.error.message;
    } catch {
      // Keep the raw (truncated) text.
    }
    throw new CodexImageError(`OpenAI Image API (${response.status}): ${detail}`);
  }
  if (!response.body) {
    throw new CodexImageError("OpenAI Image API returned no response body.");
  }

  const image = await readFirstImageFromStream(response.body, opts.signal);
  if (!image) {
    throw new CodexImageError(
      "Image generation returned no result. The prompt may have been blocked by content moderation.",
    );
  }
  return image;
}

/**
 * Consume the SSE stream and return the first completed image. The bytes arrive
 * base64-encoded on `response.output_item.done` events whose item type is
 * `image_generation_call`. Returns null when the stream ends without one.
 */
async function readFirstImageFromStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): Promise<Buffer | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) return null;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        let evt: {
          type?: string;
          item?: { type?: string; result?: string };
        };
        try {
          evt = JSON.parse(data);
        } catch {
          // Partial JSON — the next chunk completes it.
          continue;
        }
        if (
          evt.type === "response.output_item.done" &&
          evt.item?.type === "image_generation_call" &&
          evt.item.result
        ) {
          return Buffer.from(evt.item.result, "base64");
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return null;
}
