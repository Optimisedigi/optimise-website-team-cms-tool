import { CronExpressionParser } from "cron-parser";

export type ScheduledTaskScheduleMode = "manual_cron" | "monthly";

export interface FriendlyScheduleInput {
  scheduleMode?: ScheduledTaskScheduleMode | null;
  monthlyDay?: number | null;
  timeOfDay?: string | null;
}

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function buildCronFromFriendlySchedule(input: FriendlyScheduleInput): string | null {
  if (input.scheduleMode !== "monthly") return null;

  const monthlyDay = Number(input.monthlyDay ?? 1);
  if (!Number.isInteger(monthlyDay) || monthlyDay < 1 || monthlyDay > 31) {
    throw new Error("Monthly schedule day must be between 1 and 31");
  }

  const timeOfDay = String(input.timeOfDay ?? "09:00").trim();
  const match = timeOfDay.match(TIME_RE);
  if (!match) {
    throw new Error("Schedule time must be in HH:mm 24-hour format");
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return `${minute} ${hour} ${monthlyDay} * *`;
}

export function selectedBudgetAuditIds(
  audits: Array<number | string | { id: number | string }> | null | undefined,
  primaryAuditId: number | string,
): Array<number | string> {
  const ids = new Set<number | string>();
  ids.add(primaryAuditId);
  for (const audit of audits ?? []) {
    const id = typeof audit === "object" ? audit.id : audit;
    if (id !== undefined && id !== null) ids.add(id);
  }
  return Array.from(ids);
}

export function computeNextRun(
  cron: string,
  timezone: string,
  from: Date = new Date(),
): Date {
  const it = CronExpressionParser.parse(cron, {
    currentDate: from,
    tz: timezone,
  });
  return it.next().toDate();
}
