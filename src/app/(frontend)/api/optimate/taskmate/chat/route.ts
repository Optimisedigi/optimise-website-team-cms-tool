import { headers as nextHeaders } from "next/headers";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import type { Message } from "@/lib/agents/_shared/llm/types";
import { getOptiMateDefaultModels } from "@/lib/agents/_shared/optimate-default-models";
import { runTaskMateChatTurn, type TaskMateClient, type TaskMateUser } from "@/lib/agents/taskmate";
import { isAssignableTeamTaskUser, toTeamTaskUserOption } from "@/lib/team-task-users";
import { translateAgentError } from "@/lib/agents/optimate-google-ads/error-translator";

interface HistoryEntry { role: "user" | "assistant"; content: string }
const MAX_HISTORY = 50;
const MAX_MESSAGE_LENGTH = 8_000;
const MAX_HISTORY_MESSAGE_LENGTH = 8_000;

async function authenticateAdmin() {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  return { payload, user: user as { id: string | number; role?: string } | null };
}

async function activeClients(payload: Awaited<ReturnType<typeof getPayload>>): Promise<TaskMateClient[]> {
  const result = await payload.find({
    collection: "clients",
    where: { isActive: { not_equals: false } },
    sort: "name",
    limit: 500,
    depth: 0,
    overrideAccess: true,
    select: { name: true },
  });
  return result.docs.flatMap((client) => typeof client.name === "string" && client.name.trim()
    ? [{ id: String(client.id), name: client.name.trim() }]
    : []);
}

async function assignableUsers(payload: Awaited<ReturnType<typeof getPayload>>): Promise<TaskMateUser[]> {
  const result = await payload.find({
    collection: "users",
    sort: "name",
    limit: 500,
    depth: 0,
    overrideAccess: true,
    select: { name: true, email: true, role: true },
  });
  return result.docs.filter(isAssignableTeamTaskUser).map(toTeamTaskUserOption);
}

export async function GET() {
  try {
    const { payload, user } = await authenticateAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const [clients, users] = await Promise.all([activeClients(payload), assignableUsers(payload)]);
    return NextResponse.json({ clients, users });
  } catch (error) {
    console.error("[taskmate/chat] GET error:", error);
    return NextResponse.json({ error: "Failed to load TaskMate" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { payload, user } = await authenticateAdmin();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json() as { message?: unknown; history?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: `message must be 1-${MAX_MESSAGE_LENGTH} characters` }, { status: 400 });
    }
    const parsedHistory = parseHistory(body.history);
    if (!parsedHistory) return NextResponse.json({ error: "history is invalid or too large" }, { status: 400 });

    const [clients, users, settings] = await Promise.all([
      activeClients(payload),
      assignableUsers(payload),
      getOptiMateDefaultModels(payload),
    ]);
    const history = compactHistory(parsedHistory, settings.chatHistoryTokenLimit);
    const messages: Message[] = [
      ...history.map<Message>((entry) => ({ role: entry.role, content: [{ type: "text", text: entry.content }] })),
      { role: "user", content: [{ type: "text", text: message }] },
    ];
    const result = await runTaskMateChatTurn({
      messages,
      clients,
      users,
      userId: user.id,
      modelOverride: settings.defaultChatModel,
    });
    return NextResponse.json({
      reply: result.reply,
      stagedTaskList: result.stagedTaskList,
      runId: result.runId,
      modelRequested: result.modelRequested,
      modelUsed: result.modelUsed,
      source: result.source,
      clients,
      users,
    });
  } catch (error) {
    console.error("[taskmate/chat] POST error:", error);
    const translated = translateAgentError(error);
    return NextResponse.json(
      { error: translated?.userMessage ?? "TaskMate could not process that request" },
      { status: translated ? 502 : 500 },
    );
  }
}

export function parseHistory(raw: unknown): HistoryEntry[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_HISTORY) return null;
  const history: HistoryEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const value = entry as Record<string, unknown>;
    if ((value.role !== "user" && value.role !== "assistant") || typeof value.content !== "string") return null;
    const content = value.content.trim();
    if (!content || content.length > MAX_HISTORY_MESSAGE_LENGTH) return null;
    history.push({ role: value.role, content });
  }
  return history;
}

function compactHistory(history: HistoryEntry[], tokenLimit: number): HistoryEntry[] {
  const maxChars = tokenLimit * 4;
  let chars = 0;
  const recent: HistoryEntry[] = [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (!entry || (recent.length >= 8 && chars + entry.content.length > maxChars)) break;
    recent.unshift(entry);
    chars += entry.content.length;
  }
  return recent;
}
