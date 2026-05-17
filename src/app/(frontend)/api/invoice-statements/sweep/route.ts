import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPayload } from "payload";
import { headers as getHeaders } from "next/headers";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";
import type {
  StatementSnapshot,
  StatementInvoiceSnapshot,
} from "@/lib/invoice-statement-email";

export const maxDuration = 120;

const PENDING_EXPIRY_DAYS = 14;
const PAID_SINCE_DAYS = 90;

function readEnv() {
  return {
    GROWTH_TOOLS_URL: process.env.GROWTH_TOOLS_URL,
    INTERNAL_API_KEY: process.env.INTERNAL_API_KEY,
    BREVO_API_KEY: process.env.BREVO_API_KEY,
    STATEMENT_MIN_OUTSTANDING: Number(
      process.env.STATEMENT_MIN_OUTSTANDING ?? "2",
    ),
    STATEMENT_SWEEP_MAX_DRAFTS: Number(
      process.env.STATEMENT_SWEEP_MAX_DRAFTS ?? "200",
    ),
    STATEMENT_NOTIFY_EMAIL: process.env.STATEMENT_NOTIFY_EMAIL ?? "",
  };
}

interface GrowthToolsContactRow {
  contactId: string;
  contactName: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  unpaid: Array<{
    invoiceId: string;
    invoiceNumber: string;
    reference: string;
    date: string;
    dueDate: string;
    total: number;
    amountDue: number;
    status: string;
    onlineInvoiceUrl: string | null;
  }>;
  paid: Array<{
    invoiceId: string;
    invoiceNumber: string;
    reference: string;
    date: string;
    dueDate: string;
    total: number;
    amountDue: number;
    status: string;
  }>;
  totalOutstanding: number;
  totalOverdue: number;
  unpaidCount: number;
  overdueCount: number;
}

interface SweepResult {
  generated: number;
  updatedPending: number;
  expired: number;
  contactsProcessed: number;
  notified: number;
}

/**
 * GET /api/invoice-statements/sweep
 *
 * Monthly cron (Vercel: `0 22 1 * *` UTC = 08:00 Brisbane on the 2nd).
 *
 * 1. Auth via `CRON_SECRET` bearer.
 * 2. Fetch contacts with \u22652 outstanding invoices from Growth Tools.
 * 3. Safety gate: abort if response > STATEMENT_SWEEP_MAX_DRAFTS.
 * 4. Upsert one draft per Xero contact (idempotent on existing `pending`).
 * 5. Expire any `pending` row older than 14 days.
 * 6. Activity log + per-admin notifications.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
  return runSweep(payload, { triggeredBy: "cron" });
}

/**
 * POST /api/invoice-statements/sweep
 *
 * Admin-triggered manual refresh — same logic as the cron, but authenticated
 * via the user's admin session. Used by the "Refresh sweep" button on the
 * Invoice Statements page so the team can pull the latest outstanding from
 * Xero on demand (e.g. after payments come in, or after resetting test data).
 */
export async function POST(): Promise<NextResponse> {
  const cfg = await config;
  const payload = await getPayload({ config: cfg });
  const reqHeaders = await getHeaders();
  const { user } = await payload.auth({ headers: reqHeaders });
  if (!user || (user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return runSweep(payload, {
    triggeredBy: "manual",
    triggeredByEmail: (user as { email?: string }).email,
  });
}

interface SweepOptions {
  triggeredBy: "cron" | "manual";
  triggeredByEmail?: string;
}

async function runSweep(
  payload: Awaited<ReturnType<typeof getPayload>>,
  opts: SweepOptions,
): Promise<NextResponse> {
  const env = readEnv();

  if (!env.GROWTH_TOOLS_URL || !env.INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "GROWTH_TOOLS_URL or INTERNAL_API_KEY not configured" },
      { status: 500 },
    );
  }

  // 1. Fetch from Growth Tools.
  const url = new URL(`${env.GROWTH_TOOLS_URL}/api/xero/contacts/with-outstanding`);
  url.searchParams.set("minCount", String(env.STATEMENT_MIN_OUTSTANDING));
  url.searchParams.set("paidSinceDays", String(PAID_SINCE_DAYS));

  let contacts: GrowthToolsContactRow[];
  try {
    const res = await fetch(url.toString(), {
      headers: { "x-internal-key": env.INTERNAL_API_KEY },
    });
    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json(
        {
          error: `Growth Tools fetch failed (${res.status})`,
          detail: body.slice(0, 500),
        },
        { status: 502 },
      );
    }
    contacts = (await res.json()) as GrowthToolsContactRow[];
  } catch (err) {
    return NextResponse.json(
      {
        error: "Growth Tools request failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  // 2. Safety gate.
  if (contacts.length > env.STATEMENT_SWEEP_MAX_DRAFTS) {
    logActivity(payload, {
      type: "invoice_statements_sweep_aborted",
      title: `Invoice statement sweep aborted`,
      description: `Growth Tools returned ${contacts.length} contacts, above cap of ${env.STATEMENT_SWEEP_MAX_DRAFTS}.`,
    }).catch(() => {});
    return NextResponse.json(
      {
        error: "sweep cap exceeded",
        contactCount: contacts.length,
        cap: env.STATEMENT_SWEEP_MAX_DRAFTS,
      },
      { status: 500 },
    );
  }

  // 3. Upsert one draft per contact.
  const now = new Date();
  const nowIso = now.toISOString();
  let generated = 0;
  let updatedPending = 0;

  for (const row of contacts) {
    const snapshot = toSnapshot(row, nowIso);
    const existing = await payload.find({
      collection: "invoice-statement-drafts" as never,
      where: {
        and: [
          { xeroContactId: { equals: row.contactId } },
          { status: { equals: "pending" } },
        ],
      } as never,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });

    // Best-effort case-insensitive client match.
    const clientId = await findClientByName(payload, row.contactName);

    const base = {
      status: "pending",
      generatedAt: nowIso,
      xeroContactId: row.contactId,
      contactName: row.contactName,
      recipientEmail: row.emailAddress ?? "",
      client: clientId,
      totalOutstanding: row.totalOutstanding,
      totalOverdue: row.totalOverdue,
      unpaidCount: row.unpaidCount,
      overdueCount: row.overdueCount,
      snapshot,
      lastRefreshedAt: nowIso,
    } as Record<string, unknown>;

    if (existing.docs[0]) {
      const existingId = (existing.docs[0] as { id: number | string }).id;
      try {
        await payload.update({
          collection: "invoice-statement-drafts" as never,
          id: existingId,
          overrideAccess: true,
          data: base as never,
        });
        updatedPending++;
      } catch (err) {
        payload.logger?.error?.({
          msg: "invoice-statements sweep update failed",
          xeroContactId: row.contactId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      try {
        await payload.create({
          collection: "invoice-statement-drafts" as never,
          overrideAccess: true,
          data: base as never,
        });
        generated++;
      } catch (err) {
        payload.logger?.error?.({
          msg: "invoice-statements sweep create failed",
          xeroContactId: row.contactId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // 4. Expire 14-day-old pending rows.
  const cutoff = new Date(now.getTime() - PENDING_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const stale = await payload.find({
    collection: "invoice-statement-drafts" as never,
    where: {
      and: [
        { status: { equals: "pending" } },
        { generatedAt: { less_than: cutoff.toISOString() } },
      ],
    } as never,
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });
  let expired = 0;
  for (const doc of stale.docs) {
    const docId = (doc as { id: number | string }).id;
    try {
      await payload.update({
        collection: "invoice-statement-drafts" as never,
        id: docId,
        overrideAccess: true,
        data: { status: "expired" } as never,
      });
      expired++;
    } catch (err) {
      payload.logger?.error?.({
        msg: "invoice-statements expire failed",
        id: docId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 5. Activity log.
  const trigger =
    opts.triggeredBy === "manual"
      ? ` (manual by ${opts.triggeredByEmail ?? "admin"})`
      : "";
  logActivity(payload, {
    type: "invoice_statements_swept",
    title: `Invoice statement sweep${trigger}`,
    description: `Generated ${generated}, updated ${updatedPending}, expired ${expired} \u2014 ${contacts.length} contact(s) processed.`,
  }).catch(() => {});

  // 6. Notify admins (one row each) if anything new appeared.
  let notified = 0;
  if (generated + updatedPending > 0) {
    const admins = await payload.find({
      collection: "users",
      where: { role: { equals: "admin" } } as never,
      limit: 100,
      depth: 0,
      overrideAccess: true,
    });
    const totalReady = generated + updatedPending;
    for (const admin of admins.docs) {
      const adminId = (admin as { id: number | string }).id;
      try {
        await payload.create({
          collection: "notifications" as never,
          overrideAccess: true,
          data: {
            recipient: adminId,
            kind: "invoice-statements-ready",
            title: `${totalReady} client statement${totalReady === 1 ? "" : "s"} ready to review`,
            body: `Total outstanding across all drafts will be shown on the queue page.`,
            url: `/admin/finance/invoice-statements`,
          } as never,
        });
        notified++;
      } catch (err) {
        payload.logger?.error?.({
          msg: "invoice-statements notification create failed",
          adminId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Optional heads-up email via Brevo.
    if (env.STATEMENT_NOTIFY_EMAIL && env.BREVO_API_KEY) {
      try {
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "api-key": env.BREVO_API_KEY,
          },
          body: JSON.stringify({
            sender: {
              email:
                process.env.NOTIFY_FROM_EMAIL ??
                "accounts@optimisedigital.online",
              name: "Optimise Digital",
            },
            to: [{ email: env.STATEMENT_NOTIFY_EMAIL }],
            subject: `${totalReady} invoice statement${totalReady === 1 ? "" : "s"} ready for review`,
            textContent: `${totalReady} draft${totalReady === 1 ? "" : "s"} pending approval. Review at /admin/finance/invoice-statements`,
          }),
        });
      } catch (err) {
        payload.logger?.error?.({
          msg: "invoice-statements notify-email failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const result: SweepResult = {
    generated,
    updatedPending,
    expired,
    contactsProcessed: contacts.length,
    notified,
  };
  return NextResponse.json(result);
}

function toSnapshot(
  row: GrowthToolsContactRow,
  capturedAt: string,
): StatementSnapshot {
  const mapUnpaid: StatementInvoiceSnapshot[] = row.unpaid.map((inv) => ({
    invoiceId: inv.invoiceId,
    invoiceNumber: inv.invoiceNumber,
    reference: inv.reference,
    date: inv.date,
    dueDate: inv.dueDate,
    total: inv.total,
    amountDue: inv.amountDue,
    status: inv.status,
    onlineInvoiceUrl: inv.onlineInvoiceUrl,
  }));
  const mapPaid: StatementInvoiceSnapshot[] = row.paid.map((inv) => ({
    invoiceId: inv.invoiceId,
    invoiceNumber: inv.invoiceNumber,
    reference: inv.reference,
    date: inv.date,
    dueDate: inv.dueDate,
    total: inv.total,
    amountDue: inv.amountDue,
    status: inv.status,
    onlineInvoiceUrl: null,
  }));
  return {
    contact: {
      contactId: row.contactId,
      contactName: row.contactName,
      firstName: row.firstName,
      lastName: row.lastName,
      emailAddress: row.emailAddress,
    },
    unpaid: mapUnpaid,
    paid: mapPaid,
    totalOutstanding: row.totalOutstanding,
    totalOverdue: row.totalOverdue,
    unpaidCount: row.unpaidCount,
    overdueCount: row.overdueCount,
    capturedAt,
  };
}

async function findClientByName(
  payload: Awaited<ReturnType<typeof getPayload>>,
  name: string,
): Promise<number | string | null> {
  if (!name) return null;
  try {
    const result = await payload.find({
      collection: "clients",
      where: { name: { equals: name } } as never,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const first = result.docs[0] as { id: number | string } | undefined;
    return first?.id ?? null;
  } catch {
    return null;
  }
}
