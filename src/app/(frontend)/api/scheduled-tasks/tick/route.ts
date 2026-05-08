import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { CronExpressionParser } from "cron-parser";
import { getPayload } from "payload";
import config from "@/payload.config";
import { runChatTurn } from "@/lib/agents/optimate-google-ads";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";
import { createGmailDraft } from "@/lib/gmail-service";
import type { Message } from "@/lib/agents/_shared/llm/types";

export const maxDuration = 300;

interface ScheduledTaskRow {
  id: number;
  title: string;
  agentName: string;
  prompt: string;
  audit: number | { id: number };
  client: number | { id: number };
  createdBy: number | { id: number };
  recipientEmail: string;
  schedule: string;
  timezone: string;
  nextRunAt: string;
  isActive: boolean;
}

interface TickItemResult {
  id: number;
  title: string;
  status: "success" | "failed" | "skipped";
  error?: string;
  draftId?: string;
}

const MAX_PER_TICK = 20;

/**
 * GET /api/scheduled-tasks/tick
 *
 * Cron-driven runner. Authenticated by `CRON_SECRET` bearer token (Vercel Cron
 * sends this automatically when the env var is set).
 *
 * For each due schedule:
 *  1. Run the saved prompt through the named agent (single user-turn).
 *  2. Format the reply as HTML and create a Gmail draft on the owner's account.
 *  3. Advance nextRunAt from the cron expression. Errors still advance
 *     nextRunAt so a broken task doesn't spam-retry every tick.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const expected = Buffer.from(cronSecret);
  const provided = Buffer.from(token);
  if (
    expected.length !== provided.length ||
    !crypto.timingSafeEqual(expected, provided)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cfg = await config;
  const payload = await getPayload({ config: cfg });
  const now = new Date();

  const due = await payload.find({
    collection: "scheduled-agent-tasks" as never,
    where: {
      and: [
        { isActive: { equals: true } },
        { nextRunAt: { less_than_equal: now.toISOString() } },
      ],
    } as never,
    limit: MAX_PER_TICK,
    sort: "nextRunAt",
    overrideAccess: true,
    depth: 0,
  });

  const tasks = due.docs as unknown as ScheduledTaskRow[];

  const results = await Promise.allSettled(
    tasks.map((t) => runOneTask(payload, t)),
  );

  const items: TickItemResult[] = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      id: tasks[i].id,
      title: tasks[i].title,
      status: "failed",
      error: (r.reason as Error)?.message ?? String(r.reason),
    };
  });

  const succeeded = items.filter((i) => i.status === "success").length;
  const failed = items.filter((i) => i.status === "failed").length;
  return NextResponse.json({
    ran: items.length,
    succeeded,
    failed,
    items,
  });
}

async function runOneTask(
  payload: Awaited<ReturnType<typeof getPayload>>,
  task: ScheduledTaskRow,
): Promise<TickItemResult> {
  const taskId = task.id;
  const auditId = typeof task.audit === "object" ? task.audit.id : task.audit;
  const userId =
    typeof task.createdBy === "object" ? task.createdBy.id : task.createdBy;

  // Always advance nextRunAt at the end, success or fail. Compute the new
  // nextRunAt up-front so an unexpected throw still updates.
  const nextRunAt = computeNextRun(task.schedule, task.timezone, new Date());

  try {
    // 1. Load audit + linked client (depth=1 so audit.client is populated).
    const audit = await payload.findByID({
      collection: "google-ads-audits",
      id: auditId,
      overrideAccess: true,
      depth: 1,
    });
    if (!audit) throw new Error(`Audit #${auditId} not found`);

    const linkedClient = resolveClientFromAudit(audit);

    // 2. Get a valid Gmail token for the owner.
    const tokenResult = await getValidGmailToken(userId);
    if (!tokenResult.ok) {
      throw new Error(tokenResult.reason);
    }

    // 3. Run the agent for one turn with the saved prompt.
    const messages: Message[] = [
      { role: "user", content: [{ type: "text", text: task.prompt }] },
    ];

    const turn = await runChatTurn({
      audit: audit as never,
      client: linkedClient as never,
      messages,
      // Stamp this run as scheduled so tools/apply-handlers can attribute ownership.
      userId,
    });

    // 4. Format and create the Gmail draft.
    const subject = `[OptiMate] ${task.title}`;
    const htmlBody = renderReplyAsHtml({
      title: task.title,
      prompt: task.prompt,
      reply: turn.reply,
      runId: turn.runId,
      modelUsed: turn.modelUsed,
      proposals: turn.proposals,
    });

    const recipient = task.recipientEmail || tokenResult.userEmail || tokenResult.email;
    if (!recipient) throw new Error("No recipient email could be resolved");

    const draft = await createGmailDraft(tokenResult.accessToken, {
      to: recipient,
      subject,
      htmlBody,
    });

    // 5. Persist success.
    await payload.update({
      collection: "scheduled-agent-tasks" as never,
      id: taskId,
      overrideAccess: true,
      data: {
        lastRunAt: new Date().toISOString(),
        lastRunStatus: "success",
        lastRunError: null,
        lastDraftId: draft.draftId,
        nextRunAt: nextRunAt.toISOString(),
      } as never,
    });

    return {
      id: taskId,
      title: task.title,
      status: "success",
      draftId: draft.draftId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[scheduled-tasks/tick] task #${taskId} failed:`, message);
    try {
      await payload.update({
        collection: "scheduled-agent-tasks" as never,
        id: taskId,
        overrideAccess: true,
        data: {
          lastRunAt: new Date().toISOString(),
          lastRunStatus: "failed",
          lastRunError: message.slice(0, 2000),
          nextRunAt: nextRunAt.toISOString(),
        } as never,
      });
    } catch (updateErr) {
      console.error(
        `[scheduled-tasks/tick] failed to write failure status for #${taskId}:`,
        updateErr,
      );
    }
    return {
      id: taskId,
      title: task.title,
      status: "failed",
      error: message,
    };
  }
}

/**
 * Compute the next firing of a cron expression after `from`, evaluated in
 * the given IANA timezone.
 */
export function computeNextRun(
  cron: string,
  timezone: string,
  from: Date,
): Date {
  const it = CronExpressionParser.parse(cron, {
    currentDate: from,
    tz: timezone,
  });
  return it.next().toDate();
}

function resolveClientFromAudit(audit: unknown): { id?: string | number; name?: string | null } | null {
  const a = audit as Record<string, unknown>;
  const direct = a.client as { id?: string | number } | string | number | null | undefined;
  if (direct && typeof direct === "object") return direct as { id?: string | number; name?: string | null };
  if (typeof direct === "string" || typeof direct === "number") return { id: direct };
  return null;
}

/**
 * Lightweight HTML formatter for the agent reply. We don't pull in a full
 * markdown renderer for two lines of bold + bullet — we escape, then convert
 * a small set of patterns. The user can always reformat in the Gmail editor.
 */
function renderReplyAsHtml(args: {
  title: string;
  prompt: string;
  reply: string;
  runId: string;
  modelUsed: string;
  proposals: Array<{ id: number; title: string; proposalType: string; status: string }>;
}): string {
  const replyHtml = markdownishToHtml(args.reply);
  const proposalsHtml = args.proposals.length === 0
    ? ""
    : `
      <h3 style="margin-top:24px;font-family:Arial,sans-serif;">Proposals queued</h3>
      <ul style="font-family:Arial,sans-serif;">
        ${args.proposals
          .map(
            (p) =>
              `<li>#${p.id} \u2014 ${escapeHtml(p.title)} <em>(${escapeHtml(p.proposalType)}, ${escapeHtml(p.status)})</em></li>`,
          )
          .join("")}
      </ul>
    `;

  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#222;line-height:1.5;">
  <div style="font-size:13px;color:#888;margin-bottom:16px;">
    Scheduled OptiMate report \u2014 ${escapeHtml(args.title)}
  </div>
  <div style="border-left:3px solid #ddd;padding-left:12px;color:#666;font-size:13px;margin-bottom:20px;">
    <strong>Prompt:</strong><br>${escapeHtml(args.prompt).replace(/\n/g, "<br>")}
  </div>
  <div>${replyHtml}</div>
  ${proposalsHtml}
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <div style="font-size:11px;color:#aaa;">
    Run ID: ${escapeHtml(args.runId)} \u2014 model: ${escapeHtml(args.modelUsed)}
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Convert a small subset of markdown to HTML. We support paragraphs (blank
 * lines), bullet lists (- or *), bold (**...**) and inline code (`...`). Any
 * unknown markdown survives as escaped plain text — Gmail users can clean up.
 */
function markdownishToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inList = false;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length === 0) return;
    out.push(`<p style="font-family:Arial,sans-serif;">${formatInline(para.join(" "))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (bulletMatch) {
      flushPara();
      if (!inList) {
        out.push('<ul style="font-family:Arial,sans-serif;">');
        inList = true;
      }
      out.push(`<li>${formatInline(bulletMatch[1])}</li>`);
      continue;
    }
    if (line.trim() === "") {
      flushPara();
      closeList();
      continue;
    }
    closeList();
    para.push(line);
  }
  flushPara();
  closeList();
  return out.join("\n");
}

function formatInline(text: string): string {
  let s = escapeHtml(text);
  // bold **x**
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // inline code `x`
  s = s.replace(/`([^`]+)`/g, '<code style="background:#f4f4f4;padding:1px 4px;border-radius:3px;">$1</code>');
  // links [text](url)
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" style="color:#1a73e8;">$1</a>',
  );
  return s;
}
