/**
 * Tool: propose_scheduled_task
 *
 * Queues a "create a recurring agent task" approval. On Apply the dispatcher
 * creates a `scheduled-agent-tasks` row owned by the user that proposed it.
 * The cron tick endpoint picks up the row and runs the agent on every firing
 * of the cron expression, dropping the result into the user's Gmail Drafts.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { agentApprovalPath } from "@/lib/agents/_shared/admin-paths";
import { CronExpressionParser } from "cron-parser";
import { queueProposal, buildInternalMarkdown } from "./_propose-helpers";

interface ProposeScheduledTaskArgs {
  title: string;
  prompt: string;
  schedule: string;
  timezone?: string;
  recipientEmail?: string;
  summary: string;
  supportingNumbers?: string[];
}

const DEFAULT_TIMEZONE = "Australia/Brisbane";

function validateCron(expr: string, tz: string): { ok: true; nextTwo: string[] } | { ok: false; error: string } {
  try {
    const it = CronExpressionParser.parse(expr, { tz });
    const a = it.next().toDate().toISOString();
    const b = it.next().toDate().toISOString();
    return { ok: true, nextTwo: [a, b] };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function isPlausibleEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isPlausibleTimezone(tz: string): boolean {
  // IANA names look like Region/City. Reject obvious garbage early; the
  // cron-parser tz check below is the source of truth.
  return /^[A-Za-z]+(?:[\/_][A-Za-z0-9_+-]+)+$/.test(tz);
}

export const proposeScheduledTask: CanonicalTool<ProposeScheduledTaskArgs> = {
  name: "propose_scheduled_task",
  description:
    "Queue a NEW recurring agent task for human approval. The schedule is a cron expression (5 fields) evaluated in the given IANA timezone. On every firing the agent re-runs the saved `prompt` against THIS audit and drops the result in the proposer's Gmail Drafts. Use when the user asks for a recurring report, e.g. 'send me a weekly summary every Monday at 9am'. The CMS user must have Gmail connected (they'll get an error in the draft otherwise). Requires `summary` (1\u20133 sentences) and `supportingNumbers` is optional here \u2014 scheduling itself doesn't need spend justification.",
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        minLength: 3,
        maxLength: 120,
        description: "Short label, e.g. 'Weekly Acme Ads summary'.",
      },
      prompt: {
        type: "string",
        minLength: 10,
        maxLength: 2000,
        description:
          "The user-message replayed to the agent on every run. Should be self-contained \u2014 the agent re-reads this with no chat history.",
      },
      schedule: {
        type: "string",
        description:
          "5-field cron expression (minute hour day-of-month month day-of-week), e.g. '0 9 * * 1' for Mondays at 9am.",
      },
      timezone: {
        type: "string",
        description: `IANA timezone for evaluating the cron expression. Defaults to ${DEFAULT_TIMEZONE}.`,
      },
      recipientEmail: {
        type: "string",
        description:
          "Where the Gmail draft is created. Defaults to the proposing user's CMS email if omitted.",
      },
      summary: {
        type: "string",
        minLength: 10,
        maxLength: 800,
        description: "1\u20133 sentences describing the scheduled task for the approval card.",
      },
      supportingNumbers: {
        type: "array",
        items: { type: "string", maxLength: 240 },
        maxItems: 12,
      },
    },
    required: ["title", "prompt", "schedule", "summary"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;

    const title = String(obj.title ?? "").trim();
    if (title.length < 3) throw new Error("title must be at least 3 characters");
    if (title.length > 120) throw new Error("title must be at most 120 characters");

    const prompt = String(obj.prompt ?? "").trim();
    if (prompt.length < 10) throw new Error("prompt must be at least 10 characters");
    if (prompt.length > 2000) throw new Error("prompt must be at most 2000 characters");

    const schedule = String(obj.schedule ?? "").trim();
    if (!schedule) throw new Error("schedule is required");

    const timezone = obj.timezone === undefined || obj.timezone === null || obj.timezone === ""
      ? DEFAULT_TIMEZONE
      : String(obj.timezone).trim();
    if (!isPlausibleTimezone(timezone)) {
      throw new Error(
        `timezone "${timezone}" doesn't look like an IANA name (e.g. Australia/Brisbane).`,
      );
    }

    const cronCheck = validateCron(schedule, timezone);
    if (!cronCheck.ok) {
      throw new Error(`schedule is not a valid cron expression: ${cronCheck.error}`);
    }

    const summary = String(obj.summary ?? "").trim();
    if (summary.length < 10) throw new Error("summary must be at least 10 characters");

    const out: ProposeScheduledTaskArgs = { title, prompt, schedule, timezone, summary };

    if (obj.recipientEmail !== undefined && obj.recipientEmail !== null && obj.recipientEmail !== "") {
      const email = String(obj.recipientEmail).trim();
      if (!isPlausibleEmail(email)) {
        throw new Error(`recipientEmail "${email}" is not a valid email address`);
      }
      out.recipientEmail = email;
    }

    if (Array.isArray(obj.supportingNumbers)) {
      out.supportingNumbers = obj.supportingNumbers
        .map((s) => (typeof s === "string" ? s : String(s)))
        .filter((s) => s.trim().length > 0);
    }
    return out;
  },
  execute: async (args, ctx) => {
    const auditId = ctx.context.auditId as string | number | undefined;
    const clientId = ctx.context.clientId as string | number | undefined;

    if (auditId === undefined || auditId === null) {
      return { ok: false, error: "No audit context available; cannot schedule a task." };
    }

    // Compute the next two firings to show in the approval card.
    const tz = args.timezone ?? DEFAULT_TIMEZONE;
    const cronCheck = validateCron(args.schedule, tz);
    if (!cronCheck.ok) {
      return { ok: false, error: `Invalid cron: ${cronCheck.error}` };
    }

    const internalMarkdown = buildInternalMarkdown({
      summary: args.summary,
      supportingNumbers: args.supportingNumbers,
      diffSection: [
        `**Title:** ${args.title}`,
        `**Schedule:** \`${args.schedule}\` (${tz})`,
        `**Next two firings:** ${cronCheck.nextTwo.join(", ")}`,
        `**Recipient:** ${args.recipientEmail ?? "(proposer's email)"}`,
        "",
        "**Prompt that will run on each firing:**",
        "",
        "> " + args.prompt.split("\n").join("\n> "),
      ].join("\n"),
      applyEffect:
        `Will create a new \`scheduled-agent-tasks\` row owned by the proposing user, ` +
        `targeting audit #${auditId}${clientId !== undefined ? ` (client #${clientId})` : ""}. ` +
        `The cron tick endpoint will run the prompt every firing and drop the result in the user's Gmail Drafts.`,
    });

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        triggeredByUserId: ctx.context.userId as number | undefined,
        proposalType: "scheduled-task-create",
        title: `Schedule task: ${args.title}`,
        clientId,
        proposalPayload: {
          auditId,
          title: args.title,
          prompt: args.prompt,
          schedule: args.schedule,
          timezone: tz,
          ...(args.recipientEmail ? { recipientEmail: args.recipientEmail } : {}),
        },
        rendered: { internalMarkdown },
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    return {
      ok: true,
      data: {
        approvalId,
        approvalUrl: agentApprovalPath(approvalId),
        nextRunAt: cronCheck.nextTwo[0],
      },
    };
  },
};
