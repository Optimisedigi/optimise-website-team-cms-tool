import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { callLLM } from "@/lib/agents/_shared/llm";
import { DEFAULT_AUTONOMOUS_FALLBACKS } from "@/lib/agents/_shared/llm/registry";
import { getOptiMateDefaultModels } from "@/lib/agents/_shared/optimate-default-models";

/**
 * POST /api/gmail/ai-reply
 *
 * Drafts a professional reply to an inbound email. The launcher's Gmail reply
 * flow loads a message body via /api/gmail/message/[id], then posts the body
 * (plus optional user instructions) here to get an AI-suggested reply the user
 * can edit before saving to Gmail Drafts. This route never sends mail and
 * never touches Gmail — it only generates text.
 *
 * Body: { bodyText: string, subject?: string, from?: string, instructions?: string }
 * Returns: { reply: string }
 */

interface AiReplyBody {
  bodyText?: unknown;
  subject?: unknown;
  from?: unknown;
  instructions?: unknown;
  mode?: unknown;
}

const MAX_BODY_LEN = 20_000;
const MAX_INSTRUCTIONS_LEN = 8_000;

function buildSystemPrompt(): string {
  return [
    "You are an assistant that drafts emails for a digital marketing agency in Australia.",
    "Write professional, concise email copy. The user may be replying to an inbound email or drafting a brand-new outbound email from instructions.",
    "Use Australian English spelling. Keep a warm but businesslike tone.",
    "Preserve the user's intent and any instructions they give.",
    "Do not invent facts, prices, dates, or commitments that aren't supported by the supplied source text or the user's instructions.",
    "Return ONLY the email body text — no subject line, no 'To:'/'From:' headers, no surrounding quotes, no commentary.",
  ].join(" ");
}

function buildUserMessage(args: {
  bodyText: string;
  subject: string;
  from: string;
  instructions: string;
  mode: "draft" | "reply";
}): string {
  const parts: string[] = [];
  if (args.mode === "draft") {
    if (args.subject) parts.push(`Suggested subject/context: ${args.subject}`);
    parts.push("Here are my instructions/source notes for the new email:\n\n" + args.bodyText);
    parts.push(args.instructions || "\n\nDraft an appropriate outbound email on my behalf.");
    return parts.join("\n");
  }

  if (args.from) parts.push(`The email is from: ${args.from}`);
  if (args.subject) parts.push(`Subject: ${args.subject}`);
  parts.push("Here is the email I received:\n\n" + args.bodyText);
  if (args.instructions) {
    parts.push(
      "\n\nMy instructions for the reply:\n" + args.instructions,
    );
  } else {
    parts.push("\n\nDraft an appropriate reply on my behalf.");
  }
  return parts.join("\n");
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });

  if (!user) {
    return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
  }

  let body: AiReplyBody;
  try {
    body = (await req.json()) as AiReplyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const bodyText = typeof body.bodyText === "string" ? body.bodyText.trim() : "";
  if (!bodyText) {
    return NextResponse.json(
      { error: "bodyText is required and must be non-empty." },
      { status: 400 },
    );
  }

  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const from = typeof body.from === "string" ? body.from.trim() : "";
  const mode = body.mode === "draft" ? "draft" : "reply";
  const instructions =
    typeof body.instructions === "string"
      ? body.instructions.trim().slice(0, MAX_INSTRUCTIONS_LEN)
      : "";

  const { defaultAutonomousModel } = await getOptiMateDefaultModels(payload);

  try {
    const response = await callLLM({
      model: defaultAutonomousModel,
      fallbackModels: DEFAULT_AUTONOMOUS_FALLBACKS,
      maxTokens: 1500,
      temperature: 0.5,
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildUserMessage({
                bodyText: bodyText.slice(0, MAX_BODY_LEN),
                subject,
                from,
                instructions,
                mode,
              }),
            },
          ],
        },
      ],
    });

    const reply = response.message.content
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("")
      .trim();

    if (!reply) {
      return NextResponse.json(
        { error: "The AI returned an empty reply. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI reply generation failed.";
    console.error("[gmail/ai-reply] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
