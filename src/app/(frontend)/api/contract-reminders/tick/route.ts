import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPayload } from "payload";
import config from "@/payload.config";
import { buildReminderEmail } from "@/lib/contract-reminder-email";
import type { ReminderKind } from "@/lib/contract-reminders";
import { logActivity } from "@/lib/activity-log";

export const maxDuration = 300;

const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY;
const FROM_EMAIL =
  process.env.AUDIT_FROM_EMAIL || "audits@optimisedigital.online";
const ADMIN_BASE_URL =
  process.env.ADMIN_BASE_URL ||
  "https://optimise-website-team-cms-tool.vercel.app";

const MAX_PER_TICK = 50;

interface TickItemResult {
  id: number | string;
  contractId: number | string | null;
  kind: ReminderKind;
  status: "sent" | "failed" | "skipped";
  recipientsCount?: number;
  error?: string;
}

interface ReminderRow {
  id: number | string;
  kind: ReminderKind;
  sendAt: string;
  status: string;
  contract: number | { id: number | string };
  recipients?: Array<number | { id: number | string }> | null;
}

interface ContractRow {
  id: number | string;
  contractTitle?: string | null;
  clientName?: string | null;
  contractDate?: string | null;
}

interface UserRow {
  id: number | string;
  name?: string | null;
  email?: string | null;
}

/**
 * GET /api/contract-reminders/tick
 *
 * Cron-driven runner. Authenticated by `CRON_SECRET` bearer token (Vercel
 * sets this automatically when scheduled).
 *
 * For each due reminder:
 *  1. Load related contract.
 *  2. For each recipient: send a Postmark email AND create a
 *     `notifications` row.
 *  3. Flip the reminder to `sent` (or `failed` on error). Log activity.
 *
 * Idempotent at the row level — `status = "pending"` is the only thing
 * that's picked up. Once flipped, it's never re-sent automatically.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const token = authHeader?.replace("Bearer ", "");
  if (!token)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const expected = Buffer.from(cronSecret);
  const provided = Buffer.from(token);
  if (
    expected.length !== provided.length ||
    !crypto.timingSafeEqual(expected, provided)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!POSTMARK_API_KEY) {
    return NextResponse.json(
      { error: "POSTMARK_API_KEY not configured" },
      { status: 500 },
    );
  }

  const cfg = await config;
  const payload = await getPayload({ config: cfg });
  const now = new Date();

  const due = await payload.find({
    collection: "contract-reminders" as never,
    where: {
      and: [
        { status: { equals: "pending" } },
        { sendAt: { less_than_equal: now.toISOString() } },
      ],
    } as never,
    limit: MAX_PER_TICK,
    sort: "sendAt",
    depth: 1, // expand recipients + contract
    overrideAccess: true,
  });

  const rows = due.docs as unknown as ReminderRow[];
  const items: TickItemResult[] = [];

  for (const row of rows) {
    const result = await processReminder(payload, row).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      return {
        id: row.id,
        contractId: typeof row.contract === "object" ? row.contract.id : row.contract,
        kind: row.kind,
        status: "failed" as const,
        error: message,
      } satisfies TickItemResult;
    });
    items.push(result);
  }

  const sent = items.filter((i) => i.status === "sent").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const skipped = items.filter((i) => i.status === "skipped").length;

  return NextResponse.json({
    processed: items.length,
    sent,
    failed,
    skipped,
    items,
  });
}

async function processReminder(
  payload: Awaited<ReturnType<typeof getPayload>>,
  row: ReminderRow,
): Promise<TickItemResult> {
  const contractId =
    typeof row.contract === "object" ? row.contract.id : row.contract;

  // 1. Load the contract.
  let contract: ContractRow;
  try {
    contract = (await payload.findByID({
      collection: "contracts" as never,
      id: contractId,
      depth: 0,
      overrideAccess: true,
    })) as unknown as ContractRow;
  } catch {
    await markFailed(payload, row.id, "Contract not found");
    return {
      id: row.id,
      contractId,
      kind: row.kind,
      status: "failed",
      error: "Contract not found",
    };
  }

  // 2. Resolve recipients to user rows.
  const recipientRefs = Array.isArray(row.recipients) ? row.recipients : [];
  const recipientIds = recipientRefs.map((r) =>
    typeof r === "object" ? r.id : r,
  );

  if (recipientIds.length === 0) {
    await payload.update({
      collection: "contract-reminders" as never,
      id: row.id,
      overrideAccess: true,
      data: {
        status: "skipped",
        sentAt: new Date().toISOString(),
        notes: "No recipients at send time",
      } as never,
    });
    return {
      id: row.id,
      contractId,
      kind: row.kind,
      status: "skipped",
      recipientsCount: 0,
    };
  }

  const users = await payload.find({
    collection: "users",
    where: { id: { in: recipientIds } } as never,
    limit: recipientIds.length,
    depth: 0,
    overrideAccess: true,
  });
  const userRows = users.docs as unknown as UserRow[];

  // 3. Build + send one email per user; create one notification per user.
  const contractAdminUrl = `${ADMIN_BASE_URL}/admin/collections/contracts/${contractId}`;
  const errors: string[] = [];
  let sentCount = 0;

  for (const user of userRows) {
    if (!user.email) continue;
    const email = buildReminderEmail({
      kind: row.kind,
      recipientName: user.name ?? null,
      clientName: contract.clientName ?? null,
      contractTitle: contract.contractTitle ?? null,
      contractDate: contract.contractDate ?? row.sendAt,
      anniversaryDate: row.sendAt,
      contractAdminUrl,
    });

    try {
      const response = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": POSTMARK_API_KEY!,
        },
        body: JSON.stringify({
          From: FROM_EMAIL,
          To: user.email,
          Subject: email.subject,
          HtmlBody: email.html,
          TextBody: email.text,
          MessageStream: "outbound",
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Postmark ${response.status}: ${body}`);
      }
      sentCount++;
    } catch (err) {
      errors.push(
        `user ${user.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    // Best-effort: create an in-CMS notification.
    try {
      const kindKey =
        row.kind === "11-month"
          ? "contract-annual-review-11mo"
          : "contract-annual-review-11.5mo";
      await payload.create({
        collection: "notifications" as never,
        overrideAccess: true,
        data: {
          recipient: user.id,
          kind: kindKey,
          title: email.subject,
          body: row.kind === "11-month"
            ? `12-month anniversary in ~4 weeks. Time to start the annual review.`
            : `Final nudge: 12-month anniversary in ~2 weeks.`,
          url: `/admin/collections/contracts/${contractId}`,
          relatedContract: contractId,
        } as never,
      });
    } catch (err) {
      payload.logger?.error?.({
        msg: "notification create failed",
        userId: user.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 4. Persist reminder status.
  if (sentCount > 0 && errors.length === 0) {
    await payload.update({
      collection: "contract-reminders" as never,
      id: row.id,
      overrideAccess: true,
      data: {
        status: "sent",
        sentAt: new Date().toISOString(),
      } as never,
    });
    logActivity(payload, {
      type: "contract_reminder_sent",
      title: `Annual review reminder sent (${row.kind})`,
      description: `${contract.clientName ?? "Contract"} \u2014 ${sentCount} recipient(s)`,
    }).catch(() => {});
    return {
      id: row.id,
      contractId,
      kind: row.kind,
      status: "sent",
      recipientsCount: sentCount,
    };
  }

  // Either zero sent, or some succeeded but some failed — treat as failed.
  const errorMessage = errors.join("; ").slice(0, 1900);
  await markFailed(payload, row.id, errorMessage || "No emails sent");
  logActivity(payload, {
    type: "contract_reminder_failed",
    title: `Annual review reminder failed (${row.kind})`,
    description: errorMessage || "No emails sent",
  }).catch(() => {});
  return {
    id: row.id,
    contractId,
    kind: row.kind,
    status: "failed",
    error: errorMessage,
    recipientsCount: sentCount,
  };
}

async function markFailed(
  payload: Awaited<ReturnType<typeof getPayload>>,
  id: number | string,
  message: string,
): Promise<void> {
  try {
    await payload.update({
      collection: "contract-reminders" as never,
      id,
      overrideAccess: true,
      data: {
        status: "failed",
        sentAt: new Date().toISOString(),
        lastError: message.slice(0, 1900),
      } as never,
    });
  } catch (err) {
    payload.logger?.error?.({
      msg: "contract-reminders markFailed update failed",
      id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
