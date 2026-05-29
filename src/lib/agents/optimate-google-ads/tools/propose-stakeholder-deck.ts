/**
 * Tool: propose_stakeholder_deck
 *
 * Queues a stakeholder/owner deck for human approval. On Apply the apply
 * handler writes `page.tsx` + `globals.css` to a new folder under
 * `src/app/(frontend)/partners/google-ads-audit/<slug>/` so the deck is
 * served at `/partners/google-ads-audit/<slug>`.
 *
 * v1 always produces a 5-slide deck (cover, shipped, leads, keywords,
 * next). The channel-by-month slide is deferred until the GA4 tool
 * returns a monthly series — see the v1 plan.
 *
 * The tool itself NEVER writes files; it only queues the payload for
 * review. House-style rules (no em-dashes, CPA/CPL reconciliation) are
 * validated here so a bad payload fails fast inside the chat turn rather
 * than at apply time.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { agentApprovalPath } from "@/lib/agents/_shared/admin-paths";
import { queueProposal } from "./_propose-helpers";
import type {
  DeckPayload,
  KeywordRow,
  KeywordStat,
  NextItem,
} from "../apply-handlers/_deck-templates";

interface ProposeStakeholderDeckArgs extends DeckPayload {
  summary: string;
  supportingNumbers?: string[];
}

const EM_DASH = "\u2014";
const EN_DASH = "\u2013";

function containsDash(s: string): boolean {
  return s.includes(EM_DASH) || s.includes(EN_DASH);
}

function validateNoDashes(label: string, s: string): void {
  if (containsDash(s)) {
    throw new Error(
      `${label} contains an em-dash or en-dash. House style is no em/en dashes — use commas, periods, or hyphens instead.`,
    );
  }
}

function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function isSlug(s: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);
}

/**
 * Parse a tile value like "$81" or "$146" to a dollar number. Returns
 * null when the tile is not a dollar amount (e.g. "760" distinct
 * searches). Used to reconcile leads-slide CPL against keywords-slide
 * Account CPA — these are the same number under different labels and
 * must agree to within $1.
 */
function dollarsFromTile(value: string): number | null {
  const m = /^\$([\d,]+(?:\.\d+)?)$/.exec(value.trim());
  if (!m) return null;
  return Number(m[1].replace(/,/g, ""));
}

/**
 * Look up the "Account CPA" tile (the v1 contract) and return its dollar
 * value. Falls back to scanning for any tile whose label contains "CPA"
 * or "CPL" so the agent isn't forced to use a specific label string.
 */
function findCpaTile(stats: KeywordStat[]): number | null {
  const direct = stats.find((s) => /account\s*cp[al]/i.test(s.label));
  if (direct) return dollarsFromTile(direct.value);
  const any = stats.find((s) => /\bcp[al]\b/i.test(s.label));
  return any ? dollarsFromTile(any.value) : null;
}

function validatePayload(raw: unknown): ProposeStakeholderDeckArgs {
  if (!raw || typeof raw !== "object") throw new Error("input must be an object");
  const o = raw as Record<string, unknown>;

  const clientName = String(o.clientName ?? "").trim();
  if (clientName.length < 2) throw new Error("clientName must be at least 2 characters");
  const shortName = String(o.shortName ?? "").trim();
  if (shortName.length < 1) throw new Error("shortName is required");
  const slug = String(o.slug ?? "").trim();
  if (!isSlug(slug)) {
    throw new Error(
      `slug "${slug}" is invalid; use lowercase letters, digits and single hyphens (e.g. "may-2026-mtp-recap")`,
    );
  }
  const launchDate = String(o.launchDate ?? "").trim();
  if (!isYmd(launchDate)) throw new Error(`launchDate must be YYYY-MM-DD, got "${launchDate}"`);
  const reviewDate = String(o.reviewDate ?? "").trim();
  if (!isYmd(reviewDate)) throw new Error(`reviewDate must be YYYY-MM-DD, got "${reviewDate}"`);
  if (Date.parse(reviewDate) < Date.parse(launchDate)) {
    throw new Error("reviewDate must be on or after launchDate");
  }

  const shippedDid = asStringArray(o.shippedDid, "shippedDid", 1, 12);
  shippedDid.forEach((s, i) => validateNoDashes(`shippedDid[${i}]`, s));

  const shippedProduced = asStringArray(o.shippedProduced, "shippedProduced", 1, 12);
  shippedProduced.forEach((s, i) => validateNoDashes(`shippedProduced[${i}]`, s));

  const formsLeads = asNonNegInt(o.formsLeads, "formsLeads");
  const phonesLeads = asNonNegInt(o.phonesLeads, "phonesLeads");

  const leadsCopy = String(o.leadsCopy ?? "").trim();
  if (leadsCopy.length < 10) throw new Error("leadsCopy must be at least 10 characters");
  validateNoDashes("leadsCopy", leadsCopy);

  const keywordsSubtitle = String(o.keywordsSubtitle ?? "").trim();
  if (keywordsSubtitle.length < 10) throw new Error("keywordsSubtitle must be at least 10 characters");
  validateNoDashes("keywordsSubtitle", keywordsSubtitle);

  const keywordStats = asKeywordStats(o.keywordStats);
  keywordStats.forEach((s, i) => {
    validateNoDashes(`keywordStats[${i}].label`, s.label);
    validateNoDashes(`keywordStats[${i}].value`, s.value);
  });

  const keywordRows = asKeywordRows(o.keywordRows);

  const nextItems = asNextItems(o.nextItems);
  nextItems.forEach((it, i) => {
    validateNoDashes(`nextItems[${i}].headline`, it.headline);
    validateNoDashes(`nextItems[${i}].what`, it.what);
    validateNoDashes(`nextItems[${i}].why`, it.why);
  });

  const summary = String(o.summary ?? "").trim();
  if (summary.length < 10) throw new Error("summary must be at least 10 characters");
  validateNoDashes("summary", summary);

  let supportingNumbers: string[] | undefined;
  if (Array.isArray(o.supportingNumbers)) {
    supportingNumbers = o.supportingNumbers
      .map((s) => (typeof s === "string" ? s.trim() : String(s).trim()))
      .filter((s) => s.length > 0);
    supportingNumbers.forEach((s, i) => validateNoDashes(`supportingNumbers[${i}]`, s));
  }

  // Reconcile CPL (leads slide) vs CPA tile (keywords slide). Both
  // should be the same window so they must match within $1; if they
  // diverge the agent has pulled inconsistent date windows and is
  // about to ship a deck whose numbers don't reconcile.
  const totalLeads = formsLeads + phonesLeads;
  const cpaTile = findCpaTile(keywordStats);
  if (cpaTile !== null && totalLeads > 0) {
    // We can't compute the "true" CPL from inside the validator because
    // we don't have total spend independently — but we can verify the
    // CPA tile is in a sensible range vs a spend tile, if present.
    // Looser check: every tile labelled "Spend …" should produce a CPA
    // (spend / leadsTile) that matches cpaTile within $1.
    const spendTile = keywordStats.find((s) => /spend/i.test(s.label));
    const leadsStatsTile = keywordStats.find((s) => /^leads\b/i.test(s.label));
    if (spendTile && leadsStatsTile) {
      const spend = dollarsFromTile(spendTile.value);
      const leadsCount = Number(leadsStatsTile.value.replace(/[,$]/g, ""));
      if (spend !== null && Number.isFinite(leadsCount) && leadsCount > 0) {
        const derivedCpa = spend / leadsCount;
        const drift = Math.abs(derivedCpa - cpaTile);
        if (drift > 1) {
          throw new Error(
            `Numbers do not reconcile: Account CPA tile is $${cpaTile} but Spend ÷ Leads = $${derivedCpa.toFixed(0)} (drift $${drift.toFixed(0)}). Pull both from the same date window before re-proposing.`,
          );
        }
      }
    }
  }

  return {
    clientName,
    shortName,
    slug,
    launchDate,
    reviewDate,
    shippedDid,
    shippedProduced,
    formsLeads,
    phonesLeads,
    leadsCopy,
    keywordsSubtitle,
    keywordStats,
    keywordRows,
    nextItems,
    summary,
    ...(supportingNumbers ? { supportingNumbers } : {}),
  };
}

function asStringArray(v: unknown, label: string, min: number, max: number): string[] {
  if (!Array.isArray(v)) throw new Error(`${label} must be an array`);
  const arr = v.map((x, i) => {
    if (typeof x !== "string") throw new Error(`${label}[${i}] must be a string`);
    const t = x.trim();
    if (!t) throw new Error(`${label}[${i}] is empty`);
    return t;
  });
  if (arr.length < min) throw new Error(`${label} must have at least ${min} entries`);
  if (arr.length > max) throw new Error(`${label} must have at most ${max} entries`);
  return arr;
}

function asNonNegInt(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return n;
}

function asKeywordStats(v: unknown): KeywordStat[] {
  if (!Array.isArray(v)) throw new Error("keywordStats must be an array");
  if (v.length < 4 || v.length > 6) throw new Error("keywordStats must have 4 to 6 tiles (5 expected)");
  return v.map((x, i) => {
    if (!x || typeof x !== "object") throw new Error(`keywordStats[${i}] not an object`);
    const o = x as Record<string, unknown>;
    const value = String(o.value ?? "").trim();
    const label = String(o.label ?? "").trim();
    if (!value) throw new Error(`keywordStats[${i}].value is empty`);
    if (!label) throw new Error(`keywordStats[${i}].label is empty`);
    return { value, label };
  });
}

function asKeywordRows(v: unknown): KeywordRow[] {
  if (!Array.isArray(v)) throw new Error("keywordRows must be an array");
  if (v.length < 5 || v.length > 20) {
    throw new Error("keywordRows must have 5 to 20 entries (10 to 12 typical)");
  }
  return v.map((x, i) => {
    if (!x || typeof x !== "object") throw new Error(`keywordRows[${i}] not an object`);
    const o = x as Record<string, unknown>;
    const term = String(o.term ?? "").trim();
    if (!term) throw new Error(`keywordRows[${i}].term is empty`);
    validateNoDashes(`keywordRows[${i}].term`, term);
    const clicks = Number(o.clicks);
    const spend = Number(o.spend);
    const leads = Number(o.leads);
    if (!Number.isFinite(clicks) || clicks < 0) throw new Error(`keywordRows[${i}].clicks invalid`);
    if (!Number.isFinite(spend) || spend < 0) throw new Error(`keywordRows[${i}].spend invalid`);
    if (!Number.isFinite(leads) || leads < 0) throw new Error(`keywordRows[${i}].leads invalid`);
    return { term, clicks, spend, leads };
  });
}

function asNextItems(v: unknown): NextItem[] {
  if (!Array.isArray(v)) throw new Error("nextItems must be an array");
  if (v.length !== 6) throw new Error("nextItems must have exactly 6 workstreams");
  return v.map((x, i) => {
    if (!x || typeof x !== "object") throw new Error(`nextItems[${i}] not an object`);
    const o = x as Record<string, unknown>;
    const headline = String(o.headline ?? "").trim();
    const what = String(o.what ?? "").trim();
    const why = String(o.why ?? "").trim();
    if (!headline) throw new Error(`nextItems[${i}].headline is empty`);
    if (!what) throw new Error(`nextItems[${i}].what is empty`);
    if (!why) throw new Error(`nextItems[${i}].why is empty`);
    return { headline, what, why };
  });
}

/**
 * Render an internalMarkdown block the reviewer reads in
 * /admin/agent-approvals/[id]. Lists the slides + key numbers so they can
 * spot bad data without opening the raw JSON.
 */
function renderInternalMarkdown(args: ProposeStakeholderDeckArgs): string {
  const totalLeads = args.formsLeads + args.phonesLeads;
  const folder = `src/app/(frontend)/partners/google-ads-audit/${args.slug}`;
  const lines: string[] = [];
  lines.push(`**Deck preview: ${args.clientName} (${args.shortName}), slug \`${args.slug}\`**`);
  lines.push("");
  lines.push(args.summary);
  lines.push("");
  if (args.supportingNumbers && args.supportingNumbers.length > 0) {
    lines.push("**Supporting numbers**");
    lines.push("");
    for (const n of args.supportingNumbers) lines.push(`- ${n}`);
    lines.push("");
  }
  lines.push("**Will write 2 files:**");
  lines.push("");
  lines.push(`- \`${folder}/page.tsx\``);
  lines.push(`- \`${folder}/globals.css\``);
  lines.push("");
  lines.push("**Slides:**");
  lines.push("");
  lines.push(`1. Cover — ${args.clientName}, launch ${args.launchDate}, review ${args.reviewDate}`);
  lines.push(
    `2. Shipped — ${args.shippedDid.length} did items, ${args.shippedProduced.length} produced items`,
  );
  lines.push(
    `3. Leads — ${args.formsLeads} forms + ${args.phonesLeads} phones = ${totalLeads} total`,
  );
  lines.push(`4. Keywords — ${args.keywordStats.length} stats + ${args.keywordRows.length} search terms`);
  lines.push(`5. Next — ${args.nextItems.length} workstreams`);
  lines.push("");
  lines.push("**Leads copy**");
  lines.push("");
  lines.push(`> ${args.leadsCopy}`);
  lines.push("");
  lines.push("**Top keyword rows**");
  lines.push("");
  lines.push("| Term | Clicks | Spend | Leads |");
  lines.push("| --- | ---: | ---: | ---: |");
  for (const r of args.keywordRows.slice(0, 8)) {
    lines.push(`| ${r.term} | ${r.clicks} | $${r.spend} | ${r.leads} |`);
  }
  lines.push("");
  lines.push("**Next workstreams**");
  lines.push("");
  for (const it of args.nextItems) {
    lines.push(`- **${it.headline}** — ${it.what} (${it.why})`);
  }
  lines.push("");
  lines.push(
    `On Apply: writes the two files to disk. The deck will be live at \`/partners/google-ads-audit/${args.slug}\` after the next build/deploy.`,
  );
  return lines.join("\n");
}

export const proposeStakeholderDeck: CanonicalTool<ProposeStakeholderDeckArgs> = {
  name: "propose_stakeholder_deck",
  description:
    "Queue a 5-slide stakeholder/owner audit-recap deck for human approval (cover, shipped, leads, keywords, next). On Apply, writes page.tsx + globals.css under src/app/(frontend)/partners/google-ads-audit/<slug>/. House style: no em-dashes, no emoji, plain English. Pull get_search_terms + get_campaign_performance for the launch-to-today window BEFORE calling this tool so every number on the deck comes from a real tool result.",
  inputSchema: {
    type: "object",
    properties: {
      clientName: { type: "string", minLength: 2, maxLength: 120 },
      shortName: { type: "string", minLength: 1, maxLength: 40 },
      slug: {
        type: "string",
        minLength: 3,
        maxLength: 80,
        description: "kebab-case lowercase slug, e.g. may-2026-mtp-recap",
      },
      launchDate: { type: "string", description: "YYYY-MM-DD" },
      reviewDate: { type: "string", description: "YYYY-MM-DD" },
      shippedDid: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        items: { type: "string", minLength: 1, maxLength: 240 },
      },
      shippedProduced: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        items: { type: "string", minLength: 1, maxLength: 240 },
        description: "Bullets, may contain **bold** markdown for the headline number.",
      },
      formsLeads: { type: "integer", minimum: 0 },
      phonesLeads: { type: "integer", minimum: 0 },
      leadsCopy: { type: "string", minLength: 10, maxLength: 800 },
      keywordsSubtitle: { type: "string", minLength: 10, maxLength: 800 },
      keywordStats: {
        type: "array",
        minItems: 4,
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            value: { type: "string", minLength: 1, maxLength: 32 },
            label: { type: "string", minLength: 1, maxLength: 64 },
          },
          required: ["value", "label"],
          additionalProperties: false,
        },
      },
      keywordRows: {
        type: "array",
        minItems: 5,
        maxItems: 20,
        items: {
          type: "object",
          properties: {
            term: { type: "string", minLength: 1, maxLength: 200 },
            clicks: { type: "integer", minimum: 0 },
            spend: { type: "number", minimum: 0 },
            leads: { type: "integer", minimum: 0 },
          },
          required: ["term", "clicks", "spend", "leads"],
          additionalProperties: false,
        },
      },
      nextItems: {
        type: "array",
        minItems: 6,
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            headline: { type: "string", minLength: 1, maxLength: 80 },
            what: { type: "string", minLength: 1, maxLength: 400 },
            why: { type: "string", minLength: 1, maxLength: 400 },
          },
          required: ["headline", "what", "why"],
          additionalProperties: false,
        },
      },
      summary: { type: "string", minLength: 10, maxLength: 800 },
      supportingNumbers: {
        type: "array",
        items: { type: "string", maxLength: 240 },
        maxItems: 12,
      },
    },
    required: [
      "clientName",
      "shortName",
      "slug",
      "launchDate",
      "reviewDate",
      "shippedDid",
      "shippedProduced",
      "formsLeads",
      "phonesLeads",
      "leadsCopy",
      "keywordsSubtitle",
      "keywordStats",
      "keywordRows",
      "nextItems",
      "summary",
    ],
    additionalProperties: false,
  },
  validate: validatePayload,
  execute: async (args, ctx) => {
    const clientId = ctx.context.clientId as string | number | undefined;
    const auditId = ctx.context.auditId as string | number | undefined;
    const totalLeads = args.formsLeads + args.phonesLeads;
    const title = `Stakeholder deck — ${args.clientName} (${totalLeads} leads, slug ${args.slug})`;

    const internalMarkdown = renderInternalMarkdown(args);

    const { summary: _summary, supportingNumbers: _sn, ...deckPayload } = args;
    void _summary;
    void _sn;

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: "optimate-google-ads",
        agentRunId: ctx.agentRunId,
        triggeredByUserId: ctx.context.userId as number | undefined,
        proposalType: "stakeholder-deck",
        title,
        clientId,
        proposalPayload: {
          ...deckPayload,
          auditId: auditId ?? null,
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
        slug: args.slug,
        urlPath: `/partners/google-ads-audit/${args.slug}`,
      },
    };
  },
};
