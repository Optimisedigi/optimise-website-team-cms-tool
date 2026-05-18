import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getPayload } from "payload";
import config from "@payload-config";

// 2 MB of base64 ≈ 1.5 MB raw audio. Plenty for a short voice note;
// cuts off pathological large-uploads that would drain the Gemini quota.
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

// Per-user cooldown: 5 seconds between requests. In-memory only — fine for
// a single-instance deploy and acts as a basic abuse circuit-breaker.
const COOLDOWN_MS = 5_000;
const CLEANUP_INTERVAL_MS = 5 * 60_000;
const lastTranscribeAt = new Map<string, number>();
let lastCleanup = Date.now();

function cleanupExpiredEntries(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [id, ts] of lastTranscribeAt) {
    if (now - ts > COOLDOWN_MS) lastTranscribeAt.delete(id);
  }
}

export async function POST(req: NextRequest) {
  const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GOOGLE_GENERATIVE_AI_API_KEY not configured" },
      { status: 500 }
    );
  }

  const payload = await getPayload({ config: await config });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  cleanupExpiredEntries(now);
  const userKey = String(user.id);
  const last = lastTranscribeAt.get(userKey);
  if (last && now - last < COOLDOWN_MS) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 }
    );
  }

  let body: { audio?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { audio, mimeType = "audio/webm" } = body;
  if (!audio) {
    return NextResponse.json(
      { error: "audio (base64-encoded) is required" },
      { status: 400 }
    );
  }
  if (typeof audio !== "string" || audio.length > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio too large" }, { status: 413 });
  }

  lastTranscribeAt.set(userKey, now);

  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: audio,
              },
            },
            {
              text: "Transcribe this audio. Return only the transcribed text, no formatting or explanations. Use Australian English spelling.",
            },
          ],
        },
      ],
    });

    const text = response.text?.trim() ?? "";
    return NextResponse.json({ text });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Transcription failed";
    console.error("[transcribe]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
