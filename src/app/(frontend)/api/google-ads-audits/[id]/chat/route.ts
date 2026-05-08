import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { runChatTurn } from "@/lib/agents/optimate-google-ads";
import type { Message } from "@/lib/agents/_shared/llm/types";
import { isCanonicalModel } from "@/lib/agents/_shared/llm/registry";

interface IncomingHistoryEntry {
  role: "user" | "assistant";
  content: string;
}

/**
 * POST /api/google-ads-audits/[id]/chat
 *
 * Runs the Optimate-Google-Ads agent for one chat turn against the linked
 * audit. The agent loop is non-streaming — we wait for end_turn, then return
 * the final assistant text plus runId / modelUsed for the timeline viewer.
 *
 * Body: {
 *   message: string,
 *   history?: Array<{ role: "user"|"assistant", content: string }>,
 *   model?: string,         // canonical model name from CHAT_PICKER_MODELS
 *   sessionId?: string,     // unused server-side; kept for client back-compat
 * }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = (await request.json()) as {
      message?: unknown;
      history?: unknown;
      model?: unknown;
    };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const history = Array.isArray(body.history)
      ? (body.history as IncomingHistoryEntry[]).filter(
          (h) =>
            h && typeof h === "object" &&
            (h.role === "user" || h.role === "assistant") &&
            typeof h.content === "string",
        )
      : [];

    let modelOverride: string | undefined;
    if (typeof body.model === "string" && body.model.trim().length > 0) {
      if (!isCanonicalModel(body.model)) {
        return NextResponse.json(
          { error: `Unknown model: ${body.model}` },
          { status: 400 },
        );
      }
      modelOverride = body.model;
    }

    const audit = await payload.findByID({
      collection: "google-ads-audits",
      id,
      overrideAccess: true,
      depth: 1,
    });
    if (!audit) {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }
    if (!(audit as any).customerId) {
      return NextResponse.json(
        { error: "Audit has no Customer ID" },
        { status: 400 },
      );
    }

    // Resolve linked client (preferred) or fall back to any client linked
    // through the audit's proposal. Either way, this is best-effort context.
    const linkedClient = await resolveLinkedClient(payload, audit);

    const messages: Message[] = [
      ...history.map<Message>((h) => ({
        role: h.role,
        content: [{ type: "text", text: h.content }],
      })),
      { role: "user", content: [{ type: "text", text: message }] },
    ];

    const result = await runChatTurn({
      audit: audit as any,
      client: linkedClient,
      messages,
      modelOverride,
      userId: typeof user.id === "number" ? user.id : Number(user.id),
    });

    return NextResponse.json({
      reply: result.reply,
      runId: result.runId,
      modelUsed: result.modelUsed,
      source: result.source,
      proposals: result.proposals,
    });
  } catch (err) {
    console.error("[google-ads-chat] error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to process chat request" },
      { status: 500 },
    );
  }
}

async function resolveLinkedClient(
  payload: Awaited<ReturnType<typeof getPayload>>,
  audit: unknown,
): Promise<{
  id?: string | number;
  name?: string | null;
  conversionActionCategories?: Array<{ label?: string; actions?: string }> | null;
  phoneCallConversionActions?: string | null;
  formSubmitConversionActions?: string | null;
} | null> {
  const a = audit as Record<string, unknown>;
  const directClient = a.client as { id?: string | number } | string | number | null | undefined;
  let clientId: string | number | undefined;
  if (directClient && typeof directClient === "object") {
    clientId = (directClient as { id?: string | number }).id;
  } else if (typeof directClient === "string" || typeof directClient === "number") {
    clientId = directClient;
  }

  if (!clientId) {
    const proposal = a.proposal as { id?: string | number; client?: unknown } | string | number | null | undefined;
    if (proposal && typeof proposal === "object") {
      const pc = (proposal as { client?: unknown }).client;
      if (pc && typeof pc === "object") clientId = (pc as { id?: string | number }).id;
      else if (typeof pc === "string" || typeof pc === "number") clientId = pc;
    }
  }

  if (!clientId) return null;
  try {
    const c = await payload.findByID({
      collection: "clients",
      id: clientId,
      overrideAccess: true,
    });
    return c as any;
  } catch {
    return null;
  }
}
