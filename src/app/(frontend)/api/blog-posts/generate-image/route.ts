import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import config from "@/payload.config";
import { getOptiMateDefaultModels } from "@/lib/agents/_shared/optimate-default-models";
import { generateImageViaCodexOAuth } from "@/lib/blog/openai-image";

/**
 * Generate a blog hero image.
 *
 * Two paths, in order:
 *   1. ChatGPT (Codex) OAuth -> gpt-image-2. Free on the ChatGPT plan, no
 *      billed API key. Tried first on every request.
 *   2. API key -> Gemini Imagen (GOOGLE_GENERATIVE_AI_API_KEY). This is the
 *      original, billed path. It runs automatically when step 1 fails, and the
 *      response carries a `notice` so the admin UI can say the OAuth path was
 *      skipped. `useApiKey: true` forces this path directly.
 *
 * Automatic fallback is deliberate: the Codex image tool is currently stripped
 * server-side for ChatGPT accounts (verified 2026-08-23 — the same failure hits
 * gg-framework's own generate_image tool), so requiring a confirmation click on
 * every generation was pure friction. Both paths share the resize + upload tail.
 */

const OAUTH_FAILED_MESSAGE =
  "OAuth image generation didn't work, so this image was generated through the API key instead.";

export async function POST(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Matches the sibling generate-prompt route: admin session required. This
  // endpoint spends ChatGPT quota / billed API credits, so it is never public.
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    blogPostId?: string;
    title?: string;
    imagePromptOverride?: string;
    useApiKey?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { blogPostId, title, imagePromptOverride, useApiKey } = body;
  if (!blogPostId || !title) {
    return NextResponse.json(
      { error: "blogPostId and title are required" },
      { status: 400 }
    );
  }

  const prompt = imagePromptOverride?.trim();
  if (!prompt) {
    return NextResponse.json(
      { error: "Generate a prompt first using 'Generate Prompt', then click 'Generate Image'." },
      { status: 400 }
    );
  }

  try {
    let rawBuffer: Buffer;
    let source: "oauth" | "api-key";
    let notice: string | undefined;

    if (useApiKey) {
      rawBuffer = await generateWithGeminiApiKey(payload, prompt);
      source = "api-key";
    } else {
      try {
        // 1536x1024 is a valid gpt-image-2 landscape size (edges are multiples
        // of 16) and crops cleanly to the 1168x784 hero ratio below.
        rawBuffer = await generateImageViaCodexOAuth(prompt, {
          size: "1536x1024",
          quality: "high",
          signal: req.signal,
        });
        source = "oauth";
      } catch (oauthErr) {
        const detail =
          oauthErr instanceof Error ? oauthErr.message : String(oauthErr);
        console.warn("[generate-image] OAuth path failed, falling back to Gemini:", detail);
        rawBuffer = await generateWithGeminiApiKey(payload, prompt);
        source = "api-key";
        notice = OAUTH_FAILED_MESSAGE;
      }
    }

    // Resize to 1168x784 landscape + lossless WebP.
    const optimized = await sharp(rawBuffer)
      .resize(1168, 784, {
        kernel: sharp.kernel.lanczos3,
        fit: "cover",
      })
      .webp({ lossless: true })
      .toBuffer();

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80);

    const mediaDoc = await payload.create({
      collection: "media",
      data: {
        alt: `Blog header image for: ${title}`,
      },
      file: {
        data: optimized,
        mimetype: "image/webp",
        name: `${slug}.webp`,
        size: optimized.length,
      },
    });

    return NextResponse.json({
      ok: true,
      mediaId: mediaDoc.id,
      url: mediaDoc.url,
      source,
      notice,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Image generation failed";
    console.error("[generate-image]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Billed fallback: Gemini Imagen, using the model from OptiMate settings. */
async function generateWithGeminiApiKey(
  payload: Awaited<ReturnType<typeof getPayload>>,
  prompt: string
): Promise<Buffer> {
  const geminiApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!geminiApiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY not configured");
  }
  const defaults = await getOptiMateDefaultModels(payload);
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  const response = await ai.models.generateImages({
    model: defaults.blogImageGenerationModel,
    prompt,
    config: { numberOfImages: 1 },
  });

  const generated = response.generatedImages?.[0];
  if (!generated?.image?.imageBytes) {
    throw new Error("Gemini returned no image");
  }
  return Buffer.from(generated.image.imageBytes, "base64");
}
