import { NextRequest, NextResponse } from "next/server";

const KIMI_BASE_URL = process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1";
const KIMI_MODEL = process.env.KIMI_MODEL || "kimi-k2-0905-preview";

export async function POST(req: NextRequest) {
  const KIMI_API_KEY = process.env.KIMI_API_KEY;
  if (!KIMI_API_KEY) {
    return NextResponse.json(
      { error: "KIMI_API_KEY not configured" },
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

    const res = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${KIMI_API_KEY}`,
      },
      body: JSON.stringify({
        model: KIMI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.9,
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[generate-prompt] Kimi API error ${res.status}: ${detail}`);
      return NextResponse.json(
        { error: `Kimi API error: ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const prompt = data.choices?.[0]?.message?.content?.trim();
    if (!prompt) {
      return NextResponse.json(
        { error: "Kimi returned no prompt" },
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
