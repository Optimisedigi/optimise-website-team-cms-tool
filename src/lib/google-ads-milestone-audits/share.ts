import type { Payload } from "payload";
import { escapeHtml } from "@/lib/html-escape";
import { relationshipKey } from "@/lib/relationship-id";
import { ensureAuditDeckTemplate, generateSemanticDeckPayload } from "@/lib/google-ads-audit-snapshots/deck";
import { getValidGmailToken } from "@/lib/agents/_shared/user-gmail-tokens";
import { createGmailDraft } from "@/lib/gmail-service";
import type { ApplyHandler } from "@/lib/agents/_shared/apply-dispatcher";
import { queueForApproval } from "@/lib/agents/_shared/approval-queue";
import { milestoneLabel } from "./schedule";

export const MILESTONE_COLLECTION = "google-ads-milestone-audits";
export const MILESTONE_PROPOSAL_TYPE = "google-ads-milestone-audit-share";
export const MILESTONE_AGENT_NAME = "google-ads-milestone-audits";

export interface MilestoneRow {
  id: number | string;
  title: string;
  client: unknown;
  audit: unknown;
  months: number;
  goLiveDate: string;
  dueDate: string;
  status: string;
  milestoneKey: string;
  snapshot?: unknown;
  approval?: unknown;
  overallScore?: number | null;
  attempts?: number | null;
  captureStartedAt?: string | null;
  deckSlug?: string | null;
  deckUrl?: string | null;
  sharedAt?: string | null;
  gmailDraftId?: string | null;
  note?: string | null;
}

export function cmsPublicBaseUrl(): string {
  if (process.env.CMS_BASE_URL) return process.env.CMS_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "https://cms.optimisedigital.online";
}

export function milestoneDeckSlug(auditId: string | number, months: number): string {
  return `google-ads-audit-${auditId}-${months}m`;
}

function day(value: unknown): string {
  return String(value ?? "").slice(0, 10);
}

function formatMoney(value: unknown, currency: string): string | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  try {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: currency || "AUD", maximumFractionDigits: 0 }).format(n);
  } catch {
    return `$${Math.round(n).toLocaleString("en-AU")}`;
  }
}

function formatNumber(value: unknown, digits = 0): string | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString("en-AU", { maximumFractionDigits: digits });
}

export interface MilestoneEmailInput {
  clientName: string;
  months: number;
  deckUrl: string;
  periodStart: string;
  periodEnd: string;
  score: number | null;
  previous: { months: number; score: number } | null;
  totals: Record<string, unknown> | null;
  currencyCode: string;
}

export function buildMilestoneEmail(input: MilestoneEmailInput): { subject: string; html: string } {
  const label = milestoneLabel(input.months);
  const subject = `${input.clientName}: your ${label} Google Ads audit`;
  const rows: Array<[string, string]> = [];
  if (input.score != null) {
    let scoreText = `${Math.round(input.score)}/100`;
    if (input.previous) {
      const delta = Math.round(input.score - input.previous.score);
      scoreText += ` (${delta >= 0 ? "+" : ""}${delta} since the ${milestoneLabel(input.previous.months)} audit)`;
    }
    rows.push(["Account health score", scoreText]);
  }
  const t = input.totals ?? {};
  const spend = formatMoney(t.cost, input.currencyCode);
  const conversions = formatNumber(t.conversions, 1);
  const cpa = t.cpa == null ? null : formatMoney(t.cpa, input.currencyCode);
  const clicks = formatNumber(t.clicks);
  if (spend) rows.push(["Spend", spend]);
  if (clicks) rows.push(["Clicks", clicks]);
  if (conversions) rows.push(["Conversions", conversions]);
  if (cpa) rows.push(["Cost per conversion", cpa]);

  const table = rows.length
    ? `<table style="border-collapse:collapse;margin:16px 0;font-family:Arial,sans-serif;font-size:14px;">${rows
        .map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#555;">${escapeHtml(k)}</td><td style="padding:6px 0;font-weight:bold;">${escapeHtml(v)}</td></tr>`)
        .join("")}</table>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#222;line-height:1.5;">
  <p>Hi ${escapeHtml(input.clientName)} team,</p>
  <p>Your campaigns have now been live for ${input.months === 1 ? "a month" : `${input.months} months`}, so we've run your ${escapeHtml(label)} Google Ads audit. It covers ${escapeHtml(input.periodStart)} to ${escapeHtml(input.periodEnd)}.</p>
  ${table}
  <p><a href="${escapeHtml(input.deckUrl)}" style="color:#1a73e8;font-weight:bold;">View your ${escapeHtml(label)} audit</a> (use your usual client PIN to open it).</p>
  <p>It walks through what's working, where spend can be tightened, and the priorities we're focusing on next. Happy to go through it together. Just reply to this email.</p>
</body>
</html>`;
  return { subject, html };
}

/**
 * Snapshot finished: build the milestone deck as an unpublished client
 * presentation and queue it in OptiMate Approvals. Idempotent per row.
 */
export async function prepareMilestoneForApproval(payload: Payload, row: MilestoneRow, snapshot: any): Promise<void> {
  const p = payload as any;
  const auditId = relationshipKey(row.audit as never);
  const clientId = relationshipKey(row.client as never);
  if (!auditId || !clientId) throw new Error("Milestone row is missing its audit or client");
  const audit = await p.findByID({ collection: "google-ads-audits", id: auditId, depth: 0, overrideAccess: true, select: { businessName: true, deckSlideVisibility: true, contactEmail: true } });
  const client = await p.findByID({ collection: "clients", id: clientId, depth: 0, overrideAccess: true, select: { name: true, slug: true, presentations: true } });
  const label = milestoneLabel(row.months);
  const clientName = String(audit?.businessName || client?.name || "Client");

  const deck = generateSemanticDeckPayload({ id: auditId, businessName: clientName, deckSlideVisibility: audit?.deckSlideVisibility }, snapshot);
  deck.slides = deck.slides.map((slide: any) => (slide.id === "cover" ? { ...slide, title: `${label} Google Ads audit` } : slide));
  deck.milestone = { months: row.months, goLiveDate: day(row.goLiveDate), dueDate: day(row.dueDate) };

  const template = await ensureAuditDeckTemplate(payload);
  const deckSlug = milestoneDeckSlug(auditId, row.months);
  const deckUrl = `/partners/${client.slug}/${deckSlug}`;
  const presentations = Array.isArray(client.presentations) ? [...client.presentations] : [];
  const index = presentations.findIndex((item: any) => item.deckSlug === deckSlug);
  const presentation = {
    ...(index >= 0 ? presentations[index] : {}),
    title: `${clientName} ${label} Google Ads Audit`,
    deckSlug,
    deckUrl,
    kind: "deck",
    isPublic: false,
    notes: `[google-ads-milestone-audit:${row.id}] Generated from immutable snapshot ${snapshot.id}. Published when the OptiMate approval is applied.`,
    templateSlug: template.id,
    deckPayload: deck,
  };
  if (index >= 0) presentations[index] = presentation;
  else presentations.push(presentation);
  await p.update({ collection: "clients", id: clientId, data: { presentations }, overrideAccess: true });

  const score = snapshot.analysis?.scoring?.total ?? null;
  const earlier = await p.find({
    collection: MILESTONE_COLLECTION,
    where: { and: [{ audit: { equals: auditId } }, { months: { less_than: row.months } }, { overallScore: { exists: true } }] },
    sort: "-months",
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const prev = earlier.docs?.[0];
  const previous = prev && prev.overallScore != null ? { months: Number(prev.months), score: Number(prev.overallScore) } : null;
  const periodStart = day(snapshot.periodStart);
  const periodEnd = day(snapshot.periodEnd);
  const email = buildMilestoneEmail({
    clientName,
    months: row.months,
    deckUrl: `${cmsPublicBaseUrl()}${deckUrl}`,
    periodStart,
    periodEnd,
    score: score == null ? null : Number(score),
    previous,
    totals: snapshot.analysis?.totals ?? null,
    currencyCode: String(snapshot.currencyCode || "AUD"),
  });

  let approvalId = relationshipKey(row.approval as never);
  if (!approvalId) {
    const internalMarkdown = [
      `**${clientName}: ${label} Google Ads audit is ready for review.**`,
      "",
      `- Campaign start: ${day(row.goLiveDate)} · milestone date: ${day(row.dueDate)}`,
      `- Audit window: ${periodStart} to ${periodEnd}`,
      ...(() => {
        const headline = (deck as { accountGlance?: { headline?: string } } | null)?.accountGlance?.headline;
        return headline ? [`- Performance headline (slide 3, auto-written from the numbers; edit the deck before applying if the story needs changing): "${headline}"`] : [];
      })(),
      `- Score: ${score == null ? "not scored (insufficient evidence)" : `${Math.round(Number(score))}/100`}${previous ? ` (was ${Math.round(previous.score)} at ${milestoneLabel(previous.months)})` : ""}`,
      `- [Preview the deck (opens in a new tab)](/partners/_audit-preview/${auditId}?milestone=${row.id})`,
      "",
      `**Applying this approval** publishes the deck at \`${deckUrl}\` (client PIN gate) and creates a Gmail draft to the client in the applying admin's Gmail. Nothing is sent automatically.`,
    ].join("\n");
    // queueForApproval commits the row before fanning out notifications; a
    // plain create with status "pending" fans out inside the insert's
    // transaction and SQLite/libSQL silently rolls the row back.
    approvalId = await queueForApproval({
      title: `${clientName}: ${label} Google Ads audit`,
      agentName: MILESTONE_AGENT_NAME,
      agentRunId: `milestone-audit-${row.id}-${Date.now()}`,
      proposalType: MILESTONE_PROPOSAL_TYPE,
      clientId,
      proposalPayload: { milestoneId: row.id, auditId, clientId, months: row.months, deckSlug, emailSubject: email.subject, emailHtml: email.html },
      rendered: { clientHtml: email.html, internalMarkdown },
    });
  }

  await p.update({
    collection: MILESTONE_COLLECTION,
    id: row.id,
    data: {
      status: "awaiting_approval",
      snapshot: snapshot.id,
      periodStart,
      periodEnd,
      overallScore: score == null ? null : Number(score),
      deckSlug,
      deckUrl,
      approval: approvalId,
      note: null,
    },
    overrideAccess: true,
  });
}

/**
 * Apply handler for an approved milestone audit: publish the deck, then create
 * a Gmail draft to the client in the applying admin's Gmail. Idempotent.
 */
export const applyMilestoneAuditShare: ApplyHandler = async (proposal, ctx) => {
  const p = ctx.payload as any;
  const milestoneId = proposal.milestoneId as string | number | undefined;
  if (milestoneId === undefined || milestoneId === null) throw new Error("Milestone approval payload is missing milestoneId");
  const row = (await p.findByID({ collection: MILESTONE_COLLECTION, id: milestoneId, depth: 0, overrideAccess: true })) as MilestoneRow;
  if (row.status === "shared" && row.gmailDraftId) {
    return { message: "Already shared: the Gmail draft was created earlier.", detail: { gmailDraftId: row.gmailDraftId } };
  }

  // Check Gmail before publishing so a missing connection changes nothing.
  const token = await getValidGmailToken(ctx.userId);
  if (!token.ok) throw new Error(`Connect Gmail in your CMS profile before applying: ${token.reason}`);

  const clientId = relationshipKey(row.client as never);
  const auditId = relationshipKey(row.audit as never);
  const deckSlug = String(proposal.deckSlug || row.deckSlug || "");
  const client = await p.findByID({ collection: "clients", id: clientId, depth: 0, overrideAccess: true, select: { slug: true, presentations: true, contactEmail: true } });
  const presentations = Array.isArray(client.presentations) ? client.presentations : [];
  if (!presentations.some((item: any) => item.deckSlug === deckSlug)) throw new Error(`The milestone deck (${deckSlug}) is missing from the client's presentations`);
  await p.update({
    collection: "clients",
    id: clientId,
    data: { presentations: presentations.map((item: any) => (item.deckSlug === deckSlug ? { ...item, isPublic: true, presentedOn: new Date().toISOString() } : item)) },
    overrideAccess: true,
  });

  let to = String(client.contactEmail || "").trim();
  if (!to && auditId) {
    const audit = await p.findByID({ collection: "google-ads-audits", id: auditId, depth: 0, overrideAccess: true, select: { contactEmail: true } });
    to = String(audit?.contactEmail || "").trim();
  }
  const draft = await createGmailDraft(token.accessToken, {
    to,
    subject: String(proposal.emailSubject || row.title),
    htmlBody: String(proposal.emailHtml || ""),
  });

  await p.update({
    collection: MILESTONE_COLLECTION,
    id: row.id,
    data: { status: "shared", sharedAt: new Date().toISOString(), gmailDraftId: draft.draftId, note: to ? null : "No client contact email found: add the recipient in Gmail before sending." },
    overrideAccess: true,
  });
  return {
    message: `Deck published and Gmail draft created${to ? ` to ${to}` : " (no recipient set; add one in Gmail)"}.`,
    detail: { gmailDraftId: draft.draftId, gmailUrl: `https://mail.google.com/mail/u/0/#drafts/${draft.messageId}`, deckUrl: `${cmsPublicBaseUrl()}/partners/${client.slug}/${deckSlug}` },
  };
};
