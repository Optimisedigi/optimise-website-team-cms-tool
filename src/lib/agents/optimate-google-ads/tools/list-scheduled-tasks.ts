/**
 * Tool: list_scheduled_tasks
 *
 * Read-only. Returns the proposing user's scheduled-agent-tasks so the agent
 * can answer "what reports do I have set up?" without bothering the human to
 * click around the admin UI.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { getPayload } from "payload";
import payloadConfig from "@/payload.config";

interface ListScheduledTasksArgs {
  includeInactive?: boolean;
}

interface ScheduledTaskRow {
  id: number;
  title: string;
  prompt: string;
  schedule: string;
  timezone: string;
  recipientEmail: string;
  isActive: boolean;
  nextRunAt: string;
  lastRunAt?: string | null;
  lastRunStatus?: "success" | "failed" | null;
  lastRunError?: string | null;
  audit?: number | { id: number; businessName?: string | null } | null;
}

export const listScheduledTasks: CanonicalTool<ListScheduledTasksArgs> = {
  name: "list_scheduled_tasks",
  description:
    "List the calling user's scheduled agent tasks. Use to answer 'what recurring reports am I getting?' or before proposing an update so you have the right `taskId`. Returns up to 50 rows for the linked CMS user. Pass includeInactive=true to also list paused tasks.",
  inputSchema: {
    type: "object",
    properties: {
      includeInactive: {
        type: "boolean",
        description: "If true, paused tasks are included in the result.",
      },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") return {};
    const obj = raw as Record<string, unknown>;
    return {
      includeInactive: typeof obj.includeInactive === "boolean" ? obj.includeInactive : false,
    };
  },
  execute: async (args, ctx) => {
    const userId = ctx.context.userId as number | undefined;
    if (userId === undefined || userId === null) {
      return {
        ok: false,
        error: "No user context available; cannot list scheduled tasks.",
      };
    }

    const cfg = await payloadConfig;
    const payload = await getPayload({ config: cfg });

    const where: Record<string, unknown> = { createdBy: { equals: userId } };
    if (!args.includeInactive) {
      where.isActive = { equals: true };
    }

    let result;
    try {
      result = await payload.find({
        collection: "scheduled-agent-tasks" as never,
        where: where as never,
        limit: 50,
        sort: "nextRunAt",
        overrideAccess: true,
        depth: 1,
      });
    } catch (err) {
      return { ok: false, error: `Failed to list scheduled tasks: ${(err as Error).message}` };
    }

    const tasks = (result.docs as unknown as ScheduledTaskRow[]).map((t) => ({
      id: t.id,
      title: t.title,
      schedule: t.schedule,
      timezone: t.timezone,
      isActive: t.isActive,
      nextRunAt: t.nextRunAt,
      lastRunAt: t.lastRunAt ?? null,
      lastRunStatus: t.lastRunStatus ?? null,
      lastRunError: t.lastRunError ?? null,
      recipientEmail: t.recipientEmail,
      promptPreview: t.prompt.length > 200 ? `${t.prompt.slice(0, 200)}\u2026` : t.prompt,
      auditId:
        typeof t.audit === "object" && t.audit !== null
          ? t.audit.id
          : t.audit ?? null,
      auditBusinessName:
        typeof t.audit === "object" && t.audit !== null
          ? t.audit.businessName ?? null
          : null,
    }));

    return {
      ok: true,
      data: {
        count: tasks.length,
        tasks,
      },
    };
  },
};
