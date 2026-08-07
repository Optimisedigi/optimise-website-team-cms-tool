import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPayload } from "payload";
import { headers as getHeaders } from "next/headers";
import config from "@/payload.config";
import { logActivity } from "@/lib/activity-log";
import { sendBrevoEmail } from "@/lib/brevo-email";
import { monthsActiveFrom } from "@/lib/client-months-active";
import {
  buildOutstandingDigestEmail,
  type DigestClientRow,
} from "@/lib/outstanding-digest-email";
import {
  indexClientsByName,
  matchClientByName,
  type MatchableClient,
} from "@/lib/xero-client-match";

export const maxDuration = 120;

/** Fallback recipient when `ADMIN_INVOICE_DIGEST_EMAIL` is unset. */
const DEFAULT_RECIPIENT = "peter@optimisedigital.online";

/** How far back Growth Tools looks for recently-paid invoices (unused here, but
 * required by the shared endpoint contract). */
const PAID_SINCE_DAYS = 90;

interface GrowthToolsContactRow {
  contactId: string;
  contactName: string;
  emailAddress: string;
  unpaid: Array<{ dueDate: string; amountDue: number }>;
  totalOutstanding: number;
  totalOverdue: number;
  unpaidCount: number;
  overdueCount: number;
}

type ClientRecord = MatchableClient;

/**
 * GET /api/invoice-statements/admin-digest
 *
 * Monthly cron (Vercel: `0 23 1 * *` UTC = 09:00 Brisbane on the 2nd, an hour
 * after the client-facing statement sweep). Sends ONE internal digest email to
 * the agency owner listing every client with outstanding invoices — amount,
 * invoice count, overdue split, monthly retainer and how long they've been a
 * client.
 *
 * Read-only: it does not create, update or send any client-facing statement.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
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

  const payload = await getPayload({ config: await config });
  return runDigest(payload, { triggeredBy: "cron", send: true });
}

/**
 * POST /api/invoice-statements/admin-digest
 *
 * Admin-triggered send of the same digest, for testing the email or pulling an
 * ad-hoc snapshot. Pass `?preview=1` to render the HTML without sending.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const payload = await getPayload({ config: await config });
  const { user } = await payload.auth({ headers: await getHeaders() });
  if (!user || (user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const preview = req.nextUrl.searchParams.get("preview") === "1";
  return runDigest(payload, {
    triggeredBy: "manual",
    triggeredByEmail: (user as { email?: string }).email,
    send: !preview,
  });
}

interface DigestOptions {
  triggeredBy: "cron" | "manual";
  triggeredByEmail?: string;
  /** When false, build and return the email without sending it. */
  send: boolean;
}

async function runDigest(
  payload: Awaited<ReturnType<typeof getPayload>>,
  opts: DigestOptions,
): Promise<NextResponse> {
  const growthUrl = process.env.GROWTH_TOOLS_URL;
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!growthUrl || !internalKey) {
    return NextResponse.json(
      { error: "GROWTH_TOOLS_URL or INTERNAL_API_KEY not configured" },
      { status: 500 },
    );
  }

  // 1. Every contact with at least one unpaid invoice. Unlike the statement
  //    sweep we do NOT apply the "2 unpaid or 1 overdue" qualifying rule —
  //    this snapshot is meant to show everything that's still open.
  const url = new URL(`${growthUrl}/api/xero/contacts/with-outstanding`);
  url.searchParams.set("minCount", "1");
  url.searchParams.set("paidSinceDays", String(PAID_SINCE_DAYS));

  let contacts: GrowthToolsContactRow[];
  try {
    const res = await fetch(url.toString(), {
      headers: { "x-internal-key": internalKey },
      signal: AbortSignal.timeout(60_000),
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

  // 2. Enrich with CMS client data (retainer + tenure).
  const clientsByName = await loadClientsByName(payload);
  const now = new Date();
  const rows: DigestClientRow[] = contacts.map((contact) => {
    const match = matchClientByName(clientsByName, contact.contactName);
    const startDate = match?.clientStartDate ?? match?.retainerStartDate ?? null;
    return {
      contactName: contact.contactName,
      clientName: match?.name ?? null,
      totalOutstanding: contact.totalOutstanding ?? 0,
      totalOverdue: contact.totalOverdue ?? 0,
      unpaidCount: contact.unpaidCount ?? contact.unpaid?.length ?? 0,
      overdueCount: contact.overdueCount ?? 0,
      monthlyRetainer:
        typeof match?.monthlyRetainer === "number" ? match.monthlyRetainer : null,
      monthsActive: monthsActiveFrom(startDate, now),
      oldestDueDate: oldestDueDate(contact),
    };
  });

  // 3. Build the email.
  const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL?.replace(/\/$/, "") ?? "";
  const email = buildOutstandingDigestEmail({
    rows,
    adminUrl: baseUrl ? `${baseUrl}/admin/finance/invoice-statements` : undefined,
    now,
  });

  const recipient =
    process.env.ADMIN_INVOICE_DIGEST_EMAIL?.trim() || DEFAULT_RECIPIENT;

  if (!opts.send) {
    return NextResponse.json({
      preview: true,
      recipient,
      clientCount: rows.length,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  }

  const result = await sendBrevoEmail({
    to: [{ email: recipient }],
    subject: email.subject,
    htmlContent: email.html,
    textContent: email.text,
  });

  const trigger =
    opts.triggeredBy === "manual"
      ? ` (manual by ${opts.triggeredByEmail ?? "admin"})`
      : "";
  logActivity(payload, {
    type: result.ok
      ? "outstanding_invoice_digest_sent"
      : "outstanding_invoice_digest_failed",
    title: `Outstanding invoice digest${trigger}`,
    description: result.ok
      ? `Sent to ${recipient} — ${rows.length} client(s) outstanding.`
      : `Failed to send to ${recipient}: ${result.message ?? result.code ?? "unknown error"}`,
  }).catch(() => {});

  if (!result.ok) {
    payload.logger?.error?.({
      msg: "outstanding invoice digest send failed",
      recipient,
      code: result.code,
      error: result.message,
    });
    return NextResponse.json(
      {
        sent: false,
        recipient,
        clientCount: rows.length,
        error: result.message ?? result.code ?? "Brevo send failed",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    sent: true,
    recipient,
    clientCount: rows.length,
    subject: email.subject,
  });
}

/** Oldest unpaid invoice due date for a contact, or null. */
function oldestDueDate(contact: GrowthToolsContactRow): string | null {
  const dates = (contact.unpaid ?? [])
    .map((inv) => inv.dueDate)
    .filter((d): d is string => Boolean(d) && !Number.isNaN(new Date(d).getTime()))
    .sort();
  return dates[0] ?? null;
}

/** Load every CMS client and index it for Xero contact-name matching. */
async function loadClientsByName(
  payload: Awaited<ReturnType<typeof getPayload>>,
): Promise<Map<string, ClientRecord>> {
  try {
    const result = await payload.find({
      collection: "clients",
      limit: 1000,
      depth: 0,
      overrideAccess: true,
      pagination: false,
    });
    return indexClientsByName(result.docs as ClientRecord[]);
  } catch (err) {
    payload.logger?.error?.({
      msg: "outstanding invoice digest client lookup failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return new Map();
  }
}
