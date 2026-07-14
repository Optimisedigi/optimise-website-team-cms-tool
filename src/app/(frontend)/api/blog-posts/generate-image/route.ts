import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import config from "@/payload.config";
import { getOptiMateDefaultModels } from "@/lib/agents/_shared/optimate-default-models";

export async function POST(req: NextRequest) {
  const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GOOGLE_GENERATIVE_AI_API_KEY not configured" },
      { status: 500 }
    );
  }

  let body: {
    blogPostId?: string;
    title?: string;
    imagePromptOverride?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { blogPostId, title, imagePromptOverride } = body;
  if (!blogPostId || !title) {
    return NextResponse.json(
      { error: "blogPostId and title are required" },
      { status: 400 }
    );
  }

  try {
    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });
    const defaults = await getOptiMateDefaultModels(payload);

    // 1. Generate image with Gemini Imagen 4 Fast
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    if (!imagePromptOverride?.trim()) {
      return NextResponse.json(
        { error: "Generate a prompt first using 'Generate Prompt', then click 'Generate Image'." },
        { status: 400 }
      );
    }

    const prompt = imagePromptOverride.trim();

    const response = await ai.models.generateImages({
      model: defaults.blogImageGenerationModel,
      prompt,
      config: { numberOfImages: 1 },
    });

    const generated = response.generatedImages?.[0];
    if (!generated?.image?.imageBytes) {
      return NextResponse.json(
        { error: "Gemini returned no image" },
        { status: 502 }
      );
    }

    const rawBuffer = Buffer.from(generated.image.imageBytes, "base64");

    // 2. Resize to 1168x784 landscape + lossless WebP
    const optimized = await sharp(rawBuffer)
      .resize(1168, 784, {
        kernel: sharp.kernel.lanczos3,
        fit: 'cover',
      })
      .webp({ lossless: true })
      .toBuffer();

    // 3. Upload to Payload Media collection
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80);

    const fileName = `${slug}.webp`;

    const mediaDoc = await payload.create({
      collection: "media",
      data: {
        alt: `Blog header image for: ${title}`,
      },
      file: {
        data: optimized,
        mimetype: "image/webp",
        name: fileName,
        size: optimized.length,
      },
    });

    return NextResponse.json({
      ok: true,
      mediaId: mediaDoc.id,
      url: mediaDoc.url,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Image generation failed";
    console.error("[generate-image]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
