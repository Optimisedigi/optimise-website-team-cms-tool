import type { Payload } from "payload";
import { sendBrevoEmail } from "@/lib/brevo-email";
import { escapeHtml } from "@/lib/html-escape";
import { TEAM_TASK_PRIORITY_OPTIONS, TEAM_TASK_TYPE_OPTIONS } from "@/lib/team-task-options";

/**
 * "You've been assigned a task" email for Team Tasks.
 *
 * Sent through Brevo: it's the provider the rest of the CMS already uses, and
 * its free plan (300/day) has far more headroom than we use. Postmark's free
 * tier is 100/month.
 */

type RelationshipValue = string | number | { id?: string | number | null } | null | undefined;

export interface TeamTaskAssignmentDoc {
  id: string | number;
  title?: string | null;
  assignedTo?: RelationshipValue;
  client?: RelationshipValue;
  taskType?: string | null;
  priority?: string | null;
  dueDate?: string | null;
  instructions?: string | null;
}

export interface TeamTaskAssignmentEmail {
  subject: string;
  html: string;
  text: string;
}

function relationshipId(value: RelationshipValue): string | number | undefined {
  if (typeof value === "string" || typeof value === "number") return value;
  const id = value?.id;
  return typeof id === "string" || typeof id === "number" ? id : undefined;
}

function cmsBaseUrl(): string {
  if (process.env.CMS_BASE_URL) return process.env.CMS_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "https://cms.optimisedigital.online";
}

/** Team Tasks page, opened on this task's detail pane (`?task=` deep link). */
export function teamTaskPageUrl(taskId: string | number): string {
  return `${cmsBaseUrl()}/admin/collections/team-tasks?task=${encodeURIComponent(String(taskId))}`;
}

/**
 * Who to notify after a save: the assignee on create, or the new assignee when
 * the task is reassigned. Saves that leave the assignee unchanged return
 * undefined so status/notes edits never re-send.
 */
export function assigneeToNotify(
  operation: "create" | "update",
  doc: Pick<TeamTaskAssignmentDoc, "assignedTo">,
  previousDoc?: Pick<TeamTaskAssignmentDoc, "assignedTo"> | null,
): string | number | undefined {
  const current = relationshipId(doc.assignedTo);
  if (current === undefined) return undefined;
  if (operation === "create") return current;
  const previous = relationshipId(previousDoc?.assignedTo);
  return previous !== undefined && String(previous) === String(current) ? undefined : current;
}

function formatDueDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function buildTeamTaskAssignmentEmail(input: {
  task: TeamTaskAssignmentDoc;
  assigneeName?: string | null;
  clientName?: string | null;
  taskUrl: string;
}): TeamTaskAssignmentEmail {
  const { task, taskUrl } = input;
  const title = task.title?.trim() || "Untitled task";
  const greeting = input.assigneeName?.trim() ? `Hi ${input.assigneeName.trim()},` : "Hi,";
  const details: Array<[string, string]> = [];
  if (input.clientName) details.push(["Client", input.clientName]);
  const type = TEAM_TASK_TYPE_OPTIONS.find((o) => o.value === task.taskType)?.label;
  if (type) details.push(["Type", type]);
  const priority = TEAM_TASK_PRIORITY_OPTIONS.find((o) => o.value === task.priority)?.label;
  if (priority) details.push(["Priority", priority]);
  const due = formatDueDate(task.dueDate);
  if (due) details.push(["Due", due]);
  const instructions = task.instructions?.trim();

  const text = [
    greeting,
    "",
    "You've been assigned a new task:",
    "",
    title,
    ...details.map(([label, value]) => `${label}: ${value}`),
    ...(instructions ? ["", "Instructions:", instructions] : []),
    "",
    `View it on the Team Tasks page: ${taskUrl}`,
  ].join("\n");

  const detailRows = details
    .map(
      ([label, value]) =>
        `<tr><td style="padding:2px 12px 2px 0;color:#666;">${escapeHtml(label)}</td><td style="padding:2px 0;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222;">
<p>${escapeHtml(greeting)}</p>
<p>You've been assigned a new task:</p>
<h2 style="font-size:18px;margin:16px 0 8px;">${escapeHtml(title)}</h2>
${detailRows ? `<table style="border-collapse:collapse;margin-bottom:12px;">${detailRows}</table>` : ""}
${instructions ? `<p style="margin:12px 0 4px;font-weight:bold;">Instructions</p><div style="white-space:pre-wrap;">${escapeHtml(instructions)}</div>` : ""}
<p style="margin-top:20px;"><a href="${escapeHtml(taskUrl)}" style="background:#1a56db;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;">Open in Team Tasks</a></p>
<p style="color:#666;font-size:12px;">Or copy this link: ${escapeHtml(taskUrl)}</p>
</div>`;

  return { subject: `New task assigned: ${title}`, html, text };
}

/**
 * Look up the assignee/client and send the assignment email. Never throws:
 * a failed email must not affect the task save.
 */
export async function sendTeamTaskAssignmentEmail(
  payload: Payload,
  task: TeamTaskAssignmentDoc,
  assigneeId: string | number,
): Promise<void> {
  const assignee = (await payload
    .findByID({ collection: "users", id: assigneeId, depth: 0, overrideAccess: true })
    .catch(() => null)) as { email?: string | null; name?: string | null } | null;
  if (!assignee?.email) {
    payload.logger?.warn?.(`[team-tasks] assignee ${assigneeId} has no email; skipped assignment email for task ${task.id}`);
    return;
  }

  const clientId = relationshipId(task.client);
  const client =
    clientId === undefined
      ? null
      : ((await payload
          .findByID({ collection: "clients", id: clientId, depth: 0, overrideAccess: true })
          .catch(() => null)) as { name?: string | null } | null);

  const email = buildTeamTaskAssignmentEmail({
    task,
    assigneeName: assignee.name,
    clientName: client?.name,
    taskUrl: teamTaskPageUrl(task.id),
  });

  const result = await sendBrevoEmail({
    to: [{ email: assignee.email, ...(assignee.name ? { name: assignee.name } : {}) }],
    subject: email.subject,
    htmlContent: email.html,
    textContent: email.text,
  });
  if (!result.ok) {
    payload.logger?.warn?.(
      `[team-tasks] assignment email for task ${task.id} failed: ${[result.code, result.message].filter(Boolean).join(" — ")}`,
    );
  }
}
