/**
 * Tool: propose_scheduled_task_update
 *
 * Queues an approval to pause / resume / edit / delete an existing
 * `scheduled-agent-tasks` row. The agent must call list_scheduled_tasks first
 * to learn the right `taskId` (and to confirm ownership).
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { agentApprovalPath } from "@/lib/agents/_shared/admin-paths";
import { CronExpressionParser } from "cron-parser";
import { getPayload } from "payload";
import payloadConfig from "@/payload.config";
import { queueProposal, buildInternalMarkdown } from "./_propose-helpers";

interface ProposeScheduledTaskUpdateArgs {
  taskId: number;
  isActive?: boolean;
  prompt?: string;
  schedule?: string;
  timezone?: string;
  delete?: boolean;
  summary: string;
}

function validateCron(expr: string, tz: string): { ok: true } | { ok: false; error: string } {
  try {
    CronExpressionParser.parse(expr, { tz });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export const proposeScheduledTaskUpdate: CanonicalTool<ProposeScheduledTaskUpdateArgs> = {
  name: "propose_scheduled_task_update",
  description:
    "Queue an approval to pause/resume, edit, or delete an existing scheduled task by id. Use after list_scheduled_tasks. Pass `delete: true` to remove (mutually exclusive with the other edit fields). To pause: `isActive: false`. To resume: `isActive: true`. You can also change `prompt`, `schedule`, or `timezone`. The user only owns their own tasks; an attempt to update another user's task will be rejected at apply time.",
  inputSchema: {
    type: "object",
    properties: {
      taskId: { type: "number", description: "The id from list_scheduled_tasks." },
      isActive: { type: "boolean", description: "Pause (false) or resume (true)." },
      prompt: { type: "string", minLength: 10, maxLength: 2000 },
      schedule: { type: "string", description: "5-field cron expression." },
      timezone: { type: "string", description: "IANA timezone." },
      delete: { type: "boolean", description: "If true, the row is deleted; other edit fields are ignored." },
      summary: { type: "string", minLength: 10, maxLength: 800 },
    },
    required: ["taskId", "summary"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;

    const taskId = Number(obj.taskId);
    if (!Number.isFinite(taskId) || taskId <= 0) {
      throw new Error("taskId must be a positive number");
    }

    const summary = String(obj.summary ?? "").trim();
    if (summary.length < 10) throw new Error("summary must be at least 10 characters");

    const out: ProposeScheduledTaskUpdateArgs = { taskId, summary };

    const wantsDelete = Boolean(obj.delete);
    if (wantsDelete) {
      out.delete = true;
      // Other edit fields are ignored on delete \u2014 just return early.
      return out;
    }

    if (typeof obj.isActive === "boolean") out.isActive = obj.isActive;
    if (obj.prompt !== undefined && obj.prompt !== null && obj.prompt !== "") {
      const prompt = String(obj.prompt).trim();
      if (prompt.length < 10) throw new Error("prompt must be at least 10 characters");
      if (prompt.length > 2000) throw new Error("prompt must be at most 2000 characters");
      out.prompt = prompt;
    }
    if (obj.schedule !== undefined && obj.schedule !== null && obj.schedule !== "") {
      out.schedule = String(obj.schedule).trim();
    }
    if (obj.timezone !== undefined && obj.timezone !== null && obj.timezone !== "") {
      out.timezone = String(obj.timezone).trim();
    }

    if (out.schedule || out.timezone) {
      // We need a TZ to validate cron \u2014 fall back to a sensible default if only schedule changed.
      const tzForCheck = out.timezone ?? "Australia/Brisbane";
      if (out.schedule) {
        const cronCheck = validateCron(out.schedule, tzForCheck);
        if (!cronCheck.ok) {
          throw new Error(`schedule is not a valid cron expression: ${cronCheck.error}`);
        }
      }
    }

    if (
      out.isActive === undefined &&
      out.prompt === undefined &&
      out.schedule === undefined &&
      out.timezone === undefined
    ) {
      throw new Error(
        "Must specify at least one change: isActive, prompt, schedule, timezone, or delete=true.",
      );
    }
    return out;
  },
  execute: async (args, ctx) => {
    const userId = ctx.context.userId as number | undefined;
    if (userId === undefined || userId === null) {
      return { ok: false, error: "No user context available; cannot update scheduled tasks." };
    }

    // Verify the row belongs to the calling user before queueing the
    // proposal. Belt-and-braces \u2014 the apply handler re-checks this too.
    const cfg = await payloadConfig;
    const payload = await getPayload({ config: cfg });
    let row: Record<string, unknown>;
    try {
      row = (await payload.findByID({
        collection: "scheduled-agent-tasks" as never,
        id: args.taskId,
        overrideAccess: true,
        depth: 0,
      })) as unknown as Record<string, unknown>;
    } catch {
      return { ok: false, error: `Scheduled task #${args.taskId} not found.` };
    }
    const ownerId = typeof row.createdBy === "object" && row.createdBy !== null
      ? (row.createdBy as { id?: number }).id
      : (row.createdBy as number | undefined);
    if (ownerId !== userId) {
      return {
        ok: false,
        error: `Scheduled task #${args.taskId} is owned by user #${ownerId}, not the current user.`,
      };
    }

    const action = args.delete
      ? "Delete"
      : args.isActive === false
        ? "Pause"
        : args.isActive === true
          ? "Resume"
          : "Edit";

    const changeLines: string[] = [];
    if (args.delete) changeLines.push("**Delete row.**");
    else {
      if (args.isActive !== undefined) changeLines.push(`**isActive:** ${args.isActive}`);
      if (args.prompt !== undefined) changeLines.push(`**Prompt:** \n> ${args.prompt.split("\n").join("\n> ")}`);
      if (args.schedule !== undefined) changeLines.push(`**Schedule:** \`${args.schedule}\``);
      if (args.timezone !== undefined) changeLines.push(`**Timezone:** ${args.timezone}`);
    }

    const internalMarkdown = buildInternalMarkdown({
      summary: args.summary,
      diffSection: changeLines.join("\n\n"),
      applyEffect: args.delete
        ? `Will delete \`scheduled-agent-tasks\` #${args.taskId}.`
        : `Will update \`scheduled-agent-tasks\` #${args.taskId} (${action}).`,
    });

    const clientId =
      typeof row.client === "object" && row.client !== null
        ? (row.client as { id?: string | number }).id
        : (row.client as string | number | undefined);

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        triggeredByUserId: ctx.context.userId as number | undefined,
        proposalType: "scheduled-task-update",
        title: `${action} scheduled task #${args.taskId}: ${row.title ?? ""}`,
        clientId,
        proposalPayload: {
          taskId: args.taskId,
          ownerUserId: userId,
          ...(args.delete ? { delete: true } : {}),
          ...(args.isActive !== undefined ? { isActive: args.isActive } : {}),
          ...(args.prompt !== undefined ? { prompt: args.prompt } : {}),
          ...(args.schedule !== undefined ? { schedule: args.schedule } : {}),
          ...(args.timezone !== undefined ? { timezone: args.timezone } : {}),
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
      },
    };
  },
};
