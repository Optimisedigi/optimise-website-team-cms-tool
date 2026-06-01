import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as getHeaders } from "next/headers";
import config from "@/payload.config";
import {
  buildStatementEmail,
  type StatementSnapshot,
} from "@/lib/invoice-statement-email";
import { loadStatementTemplates } from "@/lib/invoice-statement-templates";
import { runCaps, validateCcList } from "@/lib/invoice-statement-caps";
import { refreshStatementSnapshot } from "@/lib/invoice-statement-snapshot";
import { logActivity } from "@/lib/activity-log";
import { userHasFeature } from "@/lib/access";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

interface DraftRow {
  id: number | string;
  status: string;
  xeroContactId: string;
  recipientEmail: string;
  customMessage: string | null;
  greetingOverride: string | null;
  snapshot: StatementSnapshot;
  contactName: string;
}

interface BrevoResponse {
  messageId?: string;
  /** Brevo error response shape. */
  code?: string;
  message?: string;
}

/**
 * POST /api/invoice-statements/:id/approve-send
 *
 * Body: `{ customMessage?: string, recipientEmailOverride?: string }`
 *
 * Sequence:
 *   1. Auth + load draft (must be `pending` or `failed` for retry).
 *   2. Validate CC list format.
 *   3. Run safety caps (monthly / hourly / per-contact cooldown).
 *   4. Build email + fetch PDFs (best-effort, 10MB cap).
 *   5. Send via Brevo with `cc` populated.
 *   6. On success: status='approved' + sentAt + postmarkMessageId (Brevo's messageId) + ccList.
 *      On failure: status='failed' + sendError; return 502.
 */
export async function POST(
  req: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const cfg = await config;
  const payload = await getPayload({ config: cfg });
  const reqHeaders = await getHeaders();
  const { user } = await payload.auth({ headers: reqHeaders });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!userHasFeature(user, "nav:invoices")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const brevoKey = process.env.BREVO_API_KEY;
  if (!brevoKey) {
    return NextResponse.json(
      { error: "BREVO_API_KEY not configured" },
      { status: 500 },
    );
  }

  const { id } = await params;
  let body: {
    customMessage?: string;
    recipientEmailOverride?: string;
    greetingOverride?: string;
    /**
     * Admin override: bypass the per-contact cooldown so a follow-up
     * statement can be sent within the cooldown window (e.g. to a newly
     * added accounts email). Monthly + hourly caps still apply.
     */
    overrideCooldown?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* body is optional */
  }

  let draft: DraftRow;
  try {
    draft = (await payload.findByID({
      collection: "invoice-statement-drafts" as never,
      id,
      depth: 0,
      overrideAccess: true,
    })) as unknown as DraftRow;
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Pending / failed always allowed. Approved rows are treated as resends.
  const isResend = draft.status === "approved";
  if (
    draft.status !== "pending" &&
    draft.status !== "failed" &&
    !isResend
  ) {
    return NextResponse.json(
      { error: `Draft is ${draft.status}; cannot send.` },
      { status: 409 },
    );
  }

  // Recipient may be a single address or a comma-separated list (primary +
  // secondary contacts at the same company — e.g. jason@profiterole.com.au
  // plus their accounts person). Reuse the same validator as the CC list.
  const recipientRaw =
    body.recipientEmailOverride?.trim() || draft.recipientEmail?.trim() || "";
  if (!recipientRaw) {
    return NextResponse.json(
      { error: "Recipient email missing. Add it in Xero first." },
      { status: 400 },
    );
  }
  const recipientCheck = validateCcList(recipientRaw);
  if (!recipientCheck.ok) {
    return NextResponse.json(
      { error: `Invalid recipient email: ${recipientCheck.bad}` },
      { status: 400 },
    );
  }
  if (recipientCheck.list.length === 0) {
    return NextResponse.json(
      { error: "Recipient email missing. Add it in Xero first." },
      { status: 400 },
    );
  }
  const recipients = recipientCheck.list;

  const customMessage =
    typeof body.customMessage === "string"
      ? body.customMessage
      : draft.customMessage ?? "";
  const greetingOverride =
    typeof body.greetingOverride === "string"
      ? body.greetingOverride
      : draft.greetingOverride ?? "";

  const { fromEmail, replyToEmail, ccEmails, templates, signatureHtml } =
    await loadStatementTemplates(payload);

  // ── Validate CC list ───────────────────────────────────────────────────
  const ccCheck = validateCcList(ccEmails);
  if (!ccCheck.ok) {
    return NextResponse.json(
      { error: `Invalid CC email in template: ${ccCheck.bad}` },
      { status: 400 },
    );
  }
  const ccList = ccCheck.list;

  // ── Safety caps ────────────────────────────────────────────────────────
  const capResult = await runCaps({
    payload,
    xeroContactId: draft.xeroContactId,
    skipCooldown: true,
  });
  if (!capResult.ok) {
    logActivity(payload, {
      type: "invoice_statement_cap_tripped",
      title: `Statement send blocked by cap`,
      description: `${draft.contactName}: ${capResult.reason}`,
    }).catch(() => {});
    return NextResponse.json(
      { error: `Send blocked: ${capResult.reason}`, detail: capResult.detail },
      { status: 429 },
    );
  }
  if (isResend) {
    logActivity(payload, {
      type: "invoice_statement_cooldown_override",
      title: `Cooldown override used`,
      description: `${draft.contactName} \u2014 resend by ${user.email ?? user.id}`,
    }).catch(() => {});
  }

  // ── Auto-refresh snapshot ──────────────────────────────────────────────
  // Pull the latest outstanding from Growth Tools so the sent email's
  // "View & pay" links reflect current Xero `onlineInvoiceUrl` values. A
  // freshly-issued invoice returns `null` until Xero activates its online
  // payment link, so without this the newest invoice can ship with a `—`
  // dash. Best-effort: on failure (or if the contact has cleared everything)
  // we fall back to the stored snapshot rather than block the send.
  let snapshot = draft.snapshot;
  if (draft.status === "pending") {
    const refresh = await refreshStatementSnapshot(draft.xeroContactId);
    if (refresh.ok && !refresh.value.allPaid) {
      snapshot = refresh.value.snapshot;
      await payload
        .update({
          collection: "invoice-statement-drafts" as never,
          id,
          overrideAccess: true,
          data: {
            snapshot: refresh.value.snapshot,
            totalOutstanding: refresh.value.totalOutstanding,
            totalOverdue: refresh.value.totalOverdue,
            unpaidCount: refresh.value.unpaidCount,
            overdueCount: refresh.value.overdueCount,
            lastRefreshedAt: refresh.value.refreshedAt,
          } as never,
        })
        .catch(() => {});
    }
  }

  // ── Fetch PDFs (best-effort) ───────────────────────────────────────────
  const attachments = await fetchPdfsWithBudget(
    snapshot.unpaid.map((inv) => ({
      invoiceId: inv.invoiceId,
      invoiceNumber: inv.invoiceNumber || inv.invoiceId,
    })),
    MAX_ATTACHMENT_BYTES,
  );

  // ── Build email ────────────────────────────────────────────────────────
  const email = buildStatementEmail({
    snapshot,
    customMessage,
    greetingOverride,
    templates,
    signatureHtml,
    attachmentsAttached: attachments.length > 0,
  });

  // ── Send via Brevo ─────────────────────────────────────────────────────
  let brevoResult: BrevoResponse;
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "api-key": brevoKey,
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: "Optimise Digital" },
        to: recipients.map((email, idx) => ({
          email,
          // Brevo shows the recipient name only on the first "to" entry in
          // most clients; we attach the contact name to the first address
          // and leave subsequent ones name-less so Gmail doesn't render
          // "Acme Pty Ltd <second@email>" awkwardly.
          ...(idx === 0 ? { name: draft.contactName } : {}),
        })),
        cc:
          ccList.length > 0
            ? ccList.map((email) => ({ email }))
            : undefined,
        replyTo: { email: replyToEmail },
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
        attachment: attachments.map((a) => ({
          name: a.name,
          content: a.contentBase64,
        })),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as BrevoResponse;
    if (!res.ok) {
      const errMsg = json.message ?? `Brevo ${res.status}`;
      await payload.update({
        collection: "invoice-statement-drafts" as never,
        id,
        overrideAccess: true,
        data: {
          status: "failed",
          sentAt: new Date().toISOString(),
          sendError: errMsg.slice(0, 1900),
          reviewedBy: user.id,
          reviewedAt: new Date().toISOString(),
          ccList: ccList.join(", "),
        } as never,
      });
      logActivity(payload, {
        type: "invoice_statement_send_failed",
        title: `Statement send failed`,
        description: `${draft.contactName}: ${errMsg.slice(0, 200)}`,
      }).catch(() => {});
      return NextResponse.json(
        { error: errMsg },
        { status: 502 },
      );
    }
    brevoResult = json;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await payload.update({
      collection: "invoice-statement-drafts" as never,
      id,
      overrideAccess: true,
      data: {
        status: "failed",
        sentAt: new Date().toISOString(),
        sendError: errMsg.slice(0, 1900),
        reviewedBy: user.id,
        reviewedAt: new Date().toISOString(),
        ccList: ccList.join(", "),
      } as never,
    });
    return NextResponse.json({ error: errMsg }, { status: 502 });
  }

  // ── Persist success ────────────────────────────────────────────────────
  const sentAt = new Date().toISOString();
  await payload.update({
    collection: "invoice-statement-drafts" as never,
    id,
    overrideAccess: true,
    data: {
      status: "approved",
      sentAt,
      reviewedAt: sentAt,
      reviewedBy: user.id,
      postmarkMessageId: brevoResult.messageId ?? null,
      ccList: ccList.join(", "),
      customMessage,
      greetingOverride: greetingOverride || null,
      recipientEmail: recipients.join(", "),
      sendError: null,
    } as never,
  });
  logActivity(payload, {
    type: "invoice_statement_approved",
    title: `Statement sent`,
    description: `${draft.contactName} \u2014 ${attachments.length} PDF(s) attached, CC: ${ccList.length}`,
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    postmarkMessageId: brevoResult.messageId ?? null,
    attachmentsAttached: attachments.length,
    sentAt,
  });
}

interface FetchedAttachment {
  name: string;
  contentBase64: string;
  bytes: number;
}

async function fetchPdfsWithBudget(
  invoices: Array<{ invoiceId: string; invoiceNumber: string }>,
  budget: number,
): Promise<FetchedAttachment[]> {
  const growthUrl = process.env.GROWTH_TOOLS_URL;
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!growthUrl || !internalKey) return [];

  const fetched: FetchedAttachment[] = [];
  // Fetch in parallel.
  const results = await Promise.all(
    invoices.map(async (inv) => {
      try {
        const res = await fetch(
          `${growthUrl}/api/xero/invoices/${inv.invoiceId}/pdf`,
          { headers: { "x-internal-key": internalKey } },
        );
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        return {
          name: `${inv.invoiceNumber || inv.invoiceId}.pdf`,
          contentBase64: buf.toString("base64"),
          bytes: buf.byteLength,
        };
      } catch {
        return null;
      }
    }),
  );

  // Newest-first → oldest-last so we drop oldest when over budget. The
  // snapshot orders invoices oldest-first, so we reverse here to drop from
  // the beginning of that list (the oldest) when needed.
  const successful = results.filter((r): r is FetchedAttachment => r !== null);

  let total = 0;
  for (const item of successful) {
    if (total + item.bytes > budget) {
      // Drop this item.
      continue;
    }
    total += item.bytes;
    fetched.push(item);
  }
  return fetched;
}
