import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { runChatTurn } from "@/lib/agents/optimate-google-ads";
import type { Message } from "@/lib/agents/_shared/llm/types";
import { isCanonicalModel } from "@/lib/agents/_shared/llm/registry";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";
import { fetchMessageBody } from "@/lib/gmail-search";

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
      attachedEmail?: unknown;
      sessionId?: unknown;
    };
    // Stable thread id. If the client didn't send one, mint a fresh UUID so
    // this turn at least lands in its own thread row instead of being lost.
    const sessionId =
      typeof body.sessionId === "string" && body.sessionId.trim().length > 0
        ? body.sessionId.trim()
        : crypto.randomUUID();
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

    // Optional attached-email context. Client only forwards metadata; we
    // fetch the body fresh from Gmail using the user's tokens so nothing
    // gets stored in the CMS.
    let decoratedMessage = message;
    const attached = body.attachedEmail;
    if (attached && typeof attached === "object") {
      const a = attached as { messageId?: unknown };
      const messageId = typeof a.messageId === "string" ? a.messageId : "";
      if (messageId) {
        const tokenResult = await getValidGmailToken(
          typeof user.id === "number" ? user.id : Number(user.id),
        );
        if (!tokenResult.ok) {
          return NextResponse.json(
            {
              error: `Could not fetch attached email: ${tokenResult.reason}`,
            },
            { status: 502 },
          );
        }
        try {
          const email = await fetchMessageBody(
            tokenResult.accessToken,
            messageId,
          );
          decoratedMessage =
            `--- Attached email ---\n` +
            `From: ${email.from}\n` +
            `Date: ${email.date}\n` +
            `Subject: ${email.subject}\n\n` +
            `${email.body}\n` +
            `--- End attached email ---\n\n` +
            message;
        } catch (err) {
          const e = err as { code?: number; status?: number; message?: string };
          return NextResponse.json(
            {
              error: `Could not fetch attached email: ${e.message ?? "Gmail fetch failed"}`,
            },
            { status: 502 },
          );
        }
      }
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

    // Track whether any persistence attempt failed so we can surface it to
    // the user inline. Persistence is best-effort — failures must NOT block
    // the chat reply — but the UI needs to know so the user isn't surprised
    // when their history vanishes on reload.
    let persisted = true;
    const handlePersistError = (label: string, err: unknown) => {
      persisted = false;
      const msg = err instanceof Error ? err.message : String(err);
      // Detect the most common production failure mode (missing table after
      // a deploy that didn't run /api/migrate) and log a single targeted
      // warning so it's easy to spot in Vercel logs.
      if (/no such table/i.test(msg)) {
        console.warn(
          `[chat-persist] optimate_chat_turns table missing — run POST /api/migrate with x-api-key header to create it. (${label})`,
        );
      } else {
        console.error(`[chat-persist] ${label} row failed:`, err);
      }
    };

    // Persist the user's prompt before the agent runs. Best-effort — if the
    // write fails (e.g. table missing on a freshly-deployed env), the chat
    // turn still proceeds. We store the user's actual prompt, not the
    // attached-email-decorated version, since the email body is fetched
    // fresh from Gmail per the existing comment above.
    const userPersistPromise = payload
      .create({
        collection: "optimate-chat-turns" as any,
        data: {
          sessionId,
          audit: id,
          user: user.id,
          client: linkedClient?.id ?? undefined,
          role: "user",
          content: message,
        },
        overrideAccess: true,
      })
      .catch((err) => {
        handlePersistError("user", err);
      });

    const messages: Message[] = [
      ...history.map<Message>((h) => ({
        role: h.role,
        content: [{ type: "text", text: h.content }],
      })),
      { role: "user", content: [{ type: "text", text: decoratedMessage }] },
    ];

    const result = await runChatTurn({
      audit: audit as any,
      client: linkedClient,
      messages,
      modelOverride,
      userId: typeof user.id === "number" ? user.id : Number(user.id),
    });

    // Persist the assistant turn. Same best-effort treatment as the user row.
    const proposalIds = Array.isArray(result.proposals)
      ? result.proposals
          .map((p) => (p && typeof p === "object" ? (p as { id?: unknown }).id : undefined))
          .filter((v): v is number | string => typeof v === "number" || typeof v === "string")
      : [];
    const assistantPersistPromise = payload
      .create({
        collection: "optimate-chat-turns" as any,
        data: {
          sessionId,
          audit: id,
          user: user.id,
          client: linkedClient?.id ?? undefined,
          role: "assistant",
          content: result.reply ?? "",
          runId: result.runId,
          modelUsed: result.modelUsed,
          proposalIds: proposalIds.length > 0 ? proposalIds : undefined,
        },
        overrideAccess: true,
      })
      .catch((err) => {
        handlePersistError("assistant", err);
      });

    // Await both persistence attempts so we can report `persisted` accurately
    // in the response. These are quick local DB writes — the agent loop
    // (multi-second LLM call) has already completed by this point, so this
    // adds negligible latency. Errors are already swallowed by the .catch
    // handlers above, so neither promise will reject.
    await Promise.all([userPersistPromise, assistantPersistPromise]);

    return NextResponse.json({
      reply: result.reply,
      runId: result.runId,
      modelRequested: result.modelRequested,
      modelUsed: result.modelUsed,
      source: result.source,
      proposals: result.proposals,
      sessionId,
      persisted,
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
