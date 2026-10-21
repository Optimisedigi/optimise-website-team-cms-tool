import type { Payload } from "payload";
import { calculateAdsTrend, calculateOrganicTrend, type AdsTrend, type OrganicTrend } from "@/lib/client-pulse";
import { CLIENT_SERVICE_OPTIONS } from "@/lib/client-field-options";
import { buildOptimateClientProfile, type OptimateClientProfile } from "@/lib/optimate-client-profile";
import { matchMessageToClient, type MatchableMessage } from "./client-matching";
import { loadClientDomainIndex } from "./store";

/**
 * Opt-in "Use client data" for Write with AI: a short, plain-text block of
 * client facts the model may quote in a reply. Only client-safe facts go in:
 * services, account managers, contract status/dates, the monthly retainer,
 * outstanding invoices, GSC and Google Ads headline figures, the ad budget and
 * recent email-timeline summaries. Never other internal commercials (revenue
 * share, setup fees, historical revenue), notes, competitors or pulse scores.
 *
 * Outstanding invoices come only from the client's latest invoice statement
 * draft (the CMS's own copy of Xero); Xero itself is never queried from here.
 * Without a statement the block says so, so the model doesn't guess.
 *
 * The client id always comes from server-side resolution (stored/matched
 * message or recipient domain), never from the browser.
 */

export const MAX_CLIENT_CONTEXT_CHARS = 4_000;
const MAX_SUMMARY_CHARS = 400;
const MAX_OVERDUE_LISTED = 8;

export interface MailClientContext {
  clientId: number;
  clientName: string;
  text: string;
}

export interface MailClientFacts {
  clientName: string;
  services: string[];
  accountManagers: string[];
  contract: {
    title: string | null;
    status: string | null;
    startDate: string | null;
    endDate: string | null;
    term: string | null;
    signedAt: string | null;
  } | null;
  /** Latest contract's monthly retainer, else the client record's. */
  monthlyRetainer: number | null;
  invoices: MailInvoiceFacts | null;
  organic: OrganicTrend | null;
  ads: AdsTrend | null;
  monthlyAdBudget: number | null;
  recentEmails: Array<{ date: string | null; summary: string }>;
}

export interface MailInvoiceFacts {
  totalOutstanding: number;
  totalOverdue: number;
  overdue: Array<{ invoiceNumber: string | null; dueDate: string | null; amountDue: number | null }>;
  asOf: string | null;
}

type PlainRecord = Record<string, unknown>;

function overdueOnly(
  invoices: Array<{ invoiceNumber?: string | null; dueDate?: string | null; amountDue?: number | null }>,
  now: Date,
): MailInvoiceFacts["overdue"] {
  const today = now.toISOString().slice(0, 10);
  return invoices
    .filter((invoice) => {
      const due = day(invoice.dueDate);
      return Boolean(due && due < today);
    })
    .map((invoice) => ({
      invoiceNumber: invoice.invoiceNumber ?? null,
      dueDate: day(invoice.dueDate),
      amountDue: typeof invoice.amountDue === "number" ? invoice.amountDue : null,
    }));
}

async function safe<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch {
    return fallback;
  }
}

function serviceLabel(value: string): string {
  return CLIENT_SERVICE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function day(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
  return match ? match[0] : null;
}

/** Facts from the profile; only the safe fields are copied out. */
function profileFacts(profile: OptimateClientProfile, now: Date): Pick<
  MailClientFacts,
  "services" | "accountManagers" | "contract" | "monthlyRetainer" | "invoices" | "monthlyAdBudget"
> {
  const services = (profile.identity?.services ?? []).map((value) => serviceLabel(String(value)));
  const accountManagers = (profile.contact?.accountManagers ?? [])
    .map((manager) => manager.name?.trim() ?? "")
    .filter(Boolean);
  const latest = profile.contracts?.latest ?? null;
  const contract = latest
    ? {
        title: latest.contractTitle,
        status: latest.status ?? null,
        startDate: day(latest.contractStartDate),
        endDate: day(latest.contractEndDate),
        term: latest.contractTerm,
        signedAt: day(latest.clientSignedAt),
      }
    : null;
  const draft = profile.invoices?.latest ?? null;
  const invoices = draft
    ? {
        totalOutstanding: draft.totalOutstanding,
        totalOverdue: draft.totalOverdue,
        overdue: overdueOnly(draft.unpaidInvoices, now),
        asOf: day(draft.snapshotCapturedAt ?? draft.lastRefreshedAt ?? draft.generatedAt),
      }
    : null;
  const retainer = [latest?.monthlyRetainer, profile.commercial?.monthlyRetainer].find(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  return {
    services,
    accountManagers,
    contract,
    monthlyRetainer: retainer ?? null,
    invoices,
    monthlyAdBudget: profile.commercial?.monthlyAdSpendBudget ?? null,
  };
}

/**
 * Load the facts for one client. Returns null when the client doesn't exist.
 * Each secondary source is loaded independently; a failing one only drops
 * its own section.
 */
export async function loadMailClientFacts(
  payload: Payload,
  clientId: number,
  now: Date,
): Promise<MailClientFacts | null> {
  const where = { client: { equals: clientId } };
  const [profile, gsc, ads, summaries] = await Promise.all([
    buildOptimateClientProfile(payload, {
      id: clientId,
      fields: ["identity", "contact", "commercial", "contracts", "invoices"],
      limit: 3,
    }),
    safe(async () => {
      const result = await payload.find({
        collection: "gsc-snapshots" as never,
        where: { and: [where, { periodStart: { like: "%-01" } }] } as never,
        select: { periodStart: true, totalClicks: true, totalImpressions: true } as never,
        sort: "-periodEnd",
        limit: 30,
        depth: 0,
        pagination: false,
        overrideAccess: true,
      });
      return calculateOrganicTrend(result.docs as unknown as PlainRecord[], now);
    }, null),
    safe(async () => {
      const result = await payload.find({
        collection: "google-ads-snapshots" as never,
        where: { and: [where, { level: { equals: "campaign" } }] } as never,
        sort: "-capturedAt",
        limit: 400,
        depth: 0,
        pagination: false,
        overrideAccess: true,
      });
      return calculateAdsTrend(result.docs as unknown as PlainRecord[], now);
    }, null),
    safe(async () => {
      const result = await payload.find({
        collection: "client-email-summaries",
        where: where as never,
        sort: "-emailDate",
        limit: 3,
        depth: 0,
        overrideAccess: true,
      });
      return result.docs.map((doc) => ({
        date: day(doc.emailDate),
        summary: String(doc.summary ?? "").trim().slice(0, MAX_SUMMARY_CHARS),
      }));
    }, []),
  ]);
  if (!profile) return null;
  return {
    clientName: profile.name?.trim() || `Client ${profile.id}`,
    ...profileFacts(profile, now),
    organic: gsc,
    ads,
    recentEmails: summaries.filter((entry) => entry.summary),
  };
}

function money(value: number): string {
  return `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function count(value: number): string {
  return Math.round(value).toLocaleString("en-AU");
}

function change(value: number | null, label: string): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}% ${label}`;
}

function withChanges(base: string, changes: Array<string | null>): string {
  const parts = changes.filter((part): part is string => Boolean(part));
  return parts.length ? `${base} (${parts.join(", ")})` : base;
}

/** Plain-text facts block, capped at MAX_CLIENT_CONTEXT_CHARS. */
export function formatMailClientContext(facts: MailClientFacts): string {
  const lines: string[] = [`Client: ${facts.clientName}`];
  if (facts.services.length) lines.push(`Services we provide: ${facts.services.join(", ")}`);
  if (facts.accountManagers.length) lines.push(`Account managers: ${facts.accountManagers.join(", ")}`);

  const contract = facts.contract;
  if (contract) {
    const parts = [
      contract.title ? `"${contract.title}"` : null,
      contract.status ? `status ${contract.status}` : null,
      contract.startDate ? `starts ${contract.startDate}` : null,
      contract.endDate ? `ends ${contract.endDate}` : null,
      contract.term ? `term ${contract.term}` : null,
      contract.signedAt ? `signed ${contract.signedAt}` : null,
    ].filter(Boolean);
    if (parts.length) lines.push(`Latest contract: ${parts.join(", ")}`);
  }

  if (facts.monthlyRetainer !== null) lines.push(`Monthly retainer: ${money(facts.monthlyRetainer)}`);

  const invoices = facts.invoices;
  if (!invoices) {
    lines.push("Invoices: no invoice statement on file, so outstanding amounts are not known");
  } else {
    const asOf = invoices.asOf ? ` as of ${invoices.asOf}` : "";
    lines.push(`Invoices${asOf}: ${money(invoices.totalOutstanding)} outstanding, ${money(invoices.totalOverdue)} overdue`);
    for (const invoice of invoices.overdue.slice(0, MAX_OVERDUE_LISTED)) {
      const amount = invoice.amountDue !== null ? ` ${money(invoice.amountDue)}` : "";
      lines.push(`- Overdue invoice ${invoice.invoiceNumber ?? "(no number)"}${amount}, due ${invoice.dueDate ?? "unknown"}`);
    }
  }

  const organic = facts.organic;
  if (organic?.month && organic.clicks !== null) {
    lines.push(
      withChanges(`Google Search Console clicks, ${organic.month}: ${count(organic.clicks)}`, [
        change(organic.momPercent, "vs previous month"),
        change(organic.yoyPercent, "vs same month last year"),
      ]),
    );
  }

  const ads = facts.ads;
  if (ads?.month) {
    const base = [
      ads.clicks !== null ? `${count(ads.clicks)} clicks` : null,
      ads.conversions !== null ? `${count(ads.conversions)} conversions` : null,
      ads.cpa !== null ? `CPA ${money(ads.cpa)}` : null,
    ].filter(Boolean);
    if (base.length) {
      lines.push(
        withChanges(`Google Ads, ${ads.month}: ${base.join(", ")}`, [
          change(ads.clicksMomPercent, "clicks vs previous month"),
          change(ads.conversionsMomPercent, "conversions vs previous month"),
          change(ads.cpaMomPercent, "CPA vs previous month"),
        ]),
      );
    }
  }
  if (ads?.mtdMonth && ads.mtdClicks !== null) {
    const conversions = ads.mtdConversions !== null ? `, ${count(ads.mtdConversions)} conversions` : "";
    lines.push(
      withChanges(`Google Ads month to date (${ads.mtdMonth}): ${count(ads.mtdClicks)} clicks${conversions}`, [
        change(ads.mtdClicksYoyPercent, "clicks vs same dates last year"),
        change(ads.mtdConversionsYoyPercent, "conversions vs same dates last year"),
      ]),
    );
  }
  if (facts.monthlyAdBudget !== null) lines.push(`Monthly Google Ads budget: ${money(facts.monthlyAdBudget)}`);

  if (facts.recentEmails.length) {
    lines.push("Recent email timeline:");
    for (const entry of facts.recentEmails) lines.push(`- ${entry.date ?? "undated"}: ${entry.summary}`);
  }

  const text = lines.join("\n");
  if (text.length <= MAX_CLIENT_CONTEXT_CHARS) return text;
  const cut = text.slice(0, MAX_CLIENT_CONTEXT_CHARS);
  const lastBreak = cut.lastIndexOf("\n");
  return lastBreak > 0 ? cut.slice(0, lastBreak) : cut;
}

/** Load and format the facts block for one server-resolved client. */
export async function buildMailClientContext(
  payload: Payload,
  clientId: number,
  now: Date,
): Promise<MailClientContext | null> {
  const facts = await loadMailClientFacts(payload, clientId, now);
  if (!facts) return null;
  return { clientId, clientName: facts.clientName, text: formatMailClientContext(facts) };
}

export interface ResolvedMailClient {
  id: number;
  name: string;
}

/**
 * The client a reply is about: the client-emails row stored for the selected
 * message (respects manual assignment and the user's own access), else the
 * domain match on its From/To/Cc. Never takes a client id from the browser.
 */
export async function resolveReplyClient(args: {
  payload: Payload;
  user: { id: number; role?: string };
  message: MatchableMessage & { messageId: string };
  ownAddresses: string[];
}): Promise<ResolvedMailClient | null> {
  const stored = await args.payload.find({
    collection: "client-emails",
    where: { gmailMessageId: { equals: args.message.messageId } },
    depth: 1,
    limit: 1,
    overrideAccess: false,
    user: args.user,
    select: { client: true },
  } as never);
  const doc = (stored as unknown as { docs: Array<{ client?: { id: number; name?: string | null } | number | null }> }).docs[0];
  if (doc?.client) {
    if (typeof doc.client === "object") return { id: doc.client.id, name: doc.client.name ?? "" };
    return { id: doc.client, name: "" };
  }
  return resolveRecipientClient({ payload: args.payload, message: args.message, ownAddresses: args.ownAddresses, userId: args.user.id });
}

/**
 * Domain/address match for a message or a new email's To/Cc. First match
 * wins. With `userId`, that user's own sender → client choices apply.
 */
export async function resolveRecipientClient(args: {
  payload: Payload;
  message: MatchableMessage;
  ownAddresses: string[];
  userId?: number;
}): Promise<ResolvedMailClient | null> {
  const index = await loadClientDomainIndex(args.payload, args.ownAddresses, { userId: args.userId });
  const match = matchMessageToClient(index, args.message);
  return match ? { id: match.clientId, name: match.clientName } : null;
}
