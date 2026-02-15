import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import config from "@/payload.config";

const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GOOGLE_GENERATIVE_AI_API_KEY not configured" },
      { status: 500 }
    );
  }

  let body: { blogPostId?: string; title?: string; excerpt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { blogPostId, title, excerpt } = body;
  if (!blogPostId || !title) {
    return NextResponse.json(
      { error: "blogPostId and title are required" },
      { status: 400 }
    );
  }

  try {
    // 1. Generate image with Gemini Imagen 4 Fast
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const prompt = [
      "Create a unique, eye-catching, professional blog header image.",
      `Topic: ${title}.`,
      excerpt ? `Context: ${excerpt}.` : "",
      "Style: Modern, clean, visually striking. No text or watermarks in the image.",
      "The image should work well as a 16:9 landscape blog hero banner.",
    ]
      .filter(Boolean)
      .join(" ");

    const response = await ai.models.generateImages({
      model: "imagen-4.0-fast-generate-001",
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

    // 2. Optimize: Lanczos3 downscale + lossless WebP
    const optimized = await sharp(rawBuffer)
      .resize(1200, null, {
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: true,
      })
      .webp({ lossless: true })
      .toBuffer();

    // 3. Upload to Payload Media collection
    const payloadConfig = await config;
    const payload = await getPayload({ config: payloadConfig });

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

    // 4. Link the image to the blog post (draft mode skips required-field validation)
    await payload.update({
      collection: "blog-posts",
      id: blogPostId,
      draft: true,
      data: {
        featuredImage: mediaDoc.id,
        featuredImageAlt: `Blog header image for: ${title}`,
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
