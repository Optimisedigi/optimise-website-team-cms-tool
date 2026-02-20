import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(req: NextRequest) {
  const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GOOGLE_GENERATIVE_AI_API_KEY not configured" },
      { status: 500 }
    );
  }

  let body: { title?: string; excerpt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { title, excerpt } = body;
  if (!title?.trim()) {
    return NextResponse.json(
      { error: "title is required" },
      { status: 400 }
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const systemPrompt = [
      "You are an expert at writing image generation prompts.",
      "Given a blog post title and optional excerpt, write a single vivid, detailed prompt for an AI image generator.",
      "The prompt should describe a visually striking, professional image suitable as a 16:9 landscape blog hero banner.",
      "Focus on composition, lighting, colors, mood, and visual elements — NOT text or typography.",
      "The prompt MUST instruct the image generator to not include any text, words, letters, numbers, watermarks, logos, or typography in the image.",
      "Return ONLY the prompt text, nothing else. No quotes, no explanation, no preamble.",
    ].join(" ");

    const userMessage = excerpt?.trim()
      ? `Blog title: "${title.trim()}"\nExcerpt: "${excerpt.trim()}"`
      : `Blog title: "${title.trim()}"`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: userMessage,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 300,
        temperature: 0.9,
      },
    });

    const prompt = response.text?.trim();
    if (!prompt) {
      return NextResponse.json(
        { error: "Gemini returned no prompt" },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, prompt });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Prompt generation failed";
    console.error("[generate-prompt]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
