import { NextResponse } from "next/server";
// Load the Payload config (via contentmate/server) before optimate-default-models:
// the two import each other, and the other order throws a TDZ ReferenceError.
import { activeContentMateClients, authenticateBlogUser } from "@/lib/contentmate/server";
import type { Message } from "@/lib/agents/_shared/llm/types";
import { getOptiMateDefaultModels } from "@/lib/agents/_shared/optimate-default-models";
import { runContentMateChatTurn } from "@/lib/agents/contentmate";
import { translateAgentError } from "@/lib/agents/optimate-google-ads/error-translator";
import { hasBlogAccess } from "@/lib/access";

export const maxDuration = 120;

interface HistoryEntry { role: "user" | "assistant"; content: string }
const MAX_HISTORY = 40;
const MAX_MESSAGE_LENGTH = 6_000;

/** GET: active clients for the ContentMate client picker. */
export async function GET() {
  try {
    const { payload, user } = await authenticateBlogUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasBlogAccess(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ clients: await activeContentMateClients(payload) });
  } catch (error) {
    console.error("[contentmate/chat] GET error:", error);
    return NextResponse.json({ error: "Failed to load ContentMate" }, { status: 500 });
  }
}

/** POST: one chat turn. Returns the reply and, when staged, a proposal the user must confirm. */
export async function POST(request: Request) {
  try {
    const { payload, user } = await authenticateBlogUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasBlogAccess(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = (await request.json().catch(() => null)) as { message?: unknown; history?: unknown; clientName?: unknown; currentIdea?: unknown } | null;
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: `message must be 1-${MAX_MESSAGE_LENGTH} characters` }, { status: 400 });
    }
    const history = parseHistory(body?.history);
    if (!history) return NextResponse.json({ error: "history is invalid or too large" }, { status: 400 });
    const fixedClientName = typeof body?.clientName === "string" && body.clientName.trim()
      ? body.clientName.trim().slice(0, 200)
      : undefined;

    const currentIdea = parseCurrentIdea(body?.currentIdea);
    const [clients, settings] = await Promise.all([activeContentMateClients(payload), getOptiMateDefaultModels(payload)]);
    const messages: Message[] = [
      ...history.map<Message>((entry) => ({ role: entry.role, content: [{ type: "text", text: entry.content }] })),
      { role: "user", content: [{ type: "text", text: message }] },
    ];
    const result = await runContentMateChatTurn({
      messages,
      clients,
      userId: user.id,
      fixedClientName,
      modelOverride: settings.defaultChatModel,
      ...(currentIdea ? { currentIdea } : {}),
    });
    return NextResponse.json({ reply: result.reply, proposal: result.proposal, saveRequest: result.saveRequest, clients });
  } catch (error) {
    console.error("[contentmate/chat] POST error:", error);
    const translated = translateAgentError(error);
    return NextResponse.json(
      { error: translated?.userMessage ?? "ContentMate could not process that request" },
      { status: translated ? 502 : 500 },
    );
  }
}

function parseHistory(raw: unknown): HistoryEntry[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_HISTORY) return null;
  const history: HistoryEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const value = entry as Record<string, unknown>;
    if ((value.role !== "user" && value.role !== "assistant") || typeof value.content !== "string") return null;
    const content = value.content.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH) return null;
    history.push({ role: value.role, content });
  }
  return history;
}

/** The idea saved earlier in this conversation (context only; the save route re-checks the record). */
function parseCurrentIdea(raw: unknown): { id: string; clientName: string; blogIdea: string } | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === "string" || typeof value.id === "number" ? String(value.id) : "";
  if (!/^\d{1,12}$/.test(id)) return undefined;
  const clientName = typeof value.clientName === "string" ? value.clientName.trim().slice(0, 200) : "";
  const blogIdea = typeof value.blogIdea === "string" ? value.blogIdea.trim().slice(0, 500) : "";
  return { id, clientName, blogIdea };
}
