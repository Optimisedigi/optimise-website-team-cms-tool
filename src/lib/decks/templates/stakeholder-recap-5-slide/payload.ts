/**
 * Payload schema + sample for the `stakeholder-recap-5-slide` template.
 *
 * Wraps the existing 5-slide MTP/Berendsen stakeholder deck shape — cover,
 * what we shipped, leads, keywords, what is next — as a live-rendered
 * template. The payload type is the same `DeckPayload` already used by the
 * file-emitting `generateDeckTsx` apply handler; we re-export it from
 * here so callers (CMS, preview route, agent tools) can import via the
 * registry path without reaching into agent internals.
 *
 * Manual validators (no Zod dep in this package) follow the pattern used
 * by `google-ads-audit-15-slide/payload.ts`: hand-rolled isObj/isStr/isNum
 * helpers plus a single `parsePayload` that throws on the first invalid
 * field with a human-readable message.
 *
 * `stakeholderRecap5SlideSamplePayload` is the verbatim Malcolm Thompson
 * Pumps (MTP) 5-slide deck so the preview route renders the existing
 * stakeholder deck unchanged when no `data` query string is supplied.
 */
import type { PayloadSchema } from "../../types";
import type {
  DeckPayload,
  KeywordRow,
  KeywordStat,
  NextItem,
} from "../../../agents/optimate-google-ads/apply-handlers/_deck-templates";

// Re-export so consumers can `import type { DeckPayload } from
// "@/lib/decks/templates/stakeholder-recap-5-slide/payload"` without
// reaching into agent internals.
export type { DeckPayload, KeywordRow, KeywordStat, NextItem };

/* ────────────────────────────────────────────────────────────────── */
/*  Validator                                                          */
/* ────────────────────────────────────────────────────────────────── */

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isStr(v: unknown): v is string {
  return typeof v === "string";
}
function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function isArr<T>(v: unknown, item: (x: unknown) => x is T): v is T[] {
  return Array.isArray(v) && v.every(item);
}
function isStrArr(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(isStr);
}

function isKeywordStat(v: unknown): v is KeywordStat {
  return isObj(v) && isStr(v.value) && isStr(v.label);
}

function isKeywordRow(v: unknown): v is KeywordRow {
  return (
    isObj(v) &&
    isStr(v.term) &&
    isNum(v.clicks) &&
    isNum(v.spend) &&
    isNum(v.leads)
  );
}

function isNextItem(v: unknown): v is NextItem {
  return (
    isObj(v) && isStr(v.headline) && isStr(v.what) && isStr(v.why)
  );
}

function parsePayload(input: unknown): DeckPayload {
  if (!isObj(input)) {
    throw new TypeError(
      "stakeholder-recap-5-slide payload: expected an object",
    );
  }

  const requireStr = (k: keyof DeckPayload): string => {
    const v = input[k as string];
    if (!isStr(v)) {
      throw new TypeError(
        `stakeholder-recap-5-slide payload: field "${String(k)}" must be a string`,
      );
    }
    return v;
  };
  const requireNum = (k: keyof DeckPayload): number => {
    const v = input[k as string];
    if (!isNum(v)) {
      throw new TypeError(
        `stakeholder-recap-5-slide payload: field "${String(k)}" must be a number`,
      );
    }
    return v;
  };
  const requireStrArr = (k: keyof DeckPayload): string[] => {
    const v = input[k as string];
    if (!isStrArr(v)) {
      throw new TypeError(
        `stakeholder-recap-5-slide payload: field "${String(k)}" must be an array of strings`,
      );
    }
    return v;
  };
  const requireArr = <T>(
    k: keyof DeckPayload,
    item: (x: unknown) => x is T,
  ): T[] => {
    const v = input[k as string];
    if (!isArr(v, item)) {
      throw new TypeError(
        `stakeholder-recap-5-slide payload: field "${String(k)}" must be an array of valid items`,
      );
    }
    return v;
  };

  return {
    clientName: requireStr("clientName"),
    shortName: requireStr("shortName"),
    slug: requireStr("slug"),
    launchDate: requireStr("launchDate"),
    reviewDate: requireStr("reviewDate"),
    shippedDid: requireStrArr("shippedDid"),
    shippedProduced: requireStrArr("shippedProduced"),
    formsLeads: requireNum("formsLeads"),
    phonesLeads: requireNum("phonesLeads"),
    leadsCopy: requireStr("leadsCopy"),
    keywordsSubtitle: requireStr("keywordsSubtitle"),
    keywordStats: requireArr("keywordStats", isKeywordStat),
    keywordRows: requireArr("keywordRows", isKeywordRow),
    nextItems: requireArr("nextItems", isNextItem),
  };
}

export const stakeholderRecap5SlideSchema: PayloadSchema<DeckPayload> = {
  name: "stakeholder-recap-5-slide payload",
  parse: parsePayload,
  safeParse(input) {
    try {
      return { ok: true, value: parsePayload(input) };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

/* ────────────────────────────────────────────────────────────────── */
/*  Sample payload — verbatim Malcolm Thompson Pumps 5-slide recap    */
/* ────────────────────────────────────────────────────────────────── */

export const stakeholderRecap5SlideSamplePayload: DeckPayload = {
  clientName: "Malcolm Thompson Pumps",
  shortName: "MTP",
  slug: "team-session-may-2026-mtp",
  launchDate: "2026-04-10",
  reviewDate: "2026-05-05",

  shippedDid: [
    "Audited every top landing page and the search intent feeding it",
    "Rebuilt the campaign structure end to end (Brand and Generic split)",
    "Rebuilt lead tracking, phone calls and form submissions, verified",
    "Wrote new ad copy across every ad group",
    "Built and applied negative keyword lists",
    "Added phrase match keyword coverage (15 added)",
  ],
  shippedProduced: [
    "**29 leads** since 10 April (14 form, 15 phone)",
    "**Account level cost per lead, $81 in April 2026**",
    "**Paid sessions in April, 5.8 times March**",
    "**Lead tracking firing correctly**, the first trustworthy baseline the account has had",
    "**Brand campaigns drove 68 percent of leads**",
  ],

  formsLeads: 14,
  phonesLeads: 15,
  leadsCopy:
    "These are the leads coming directly through Google Ads, based on what we are tracking. 29 leads since the new structure went live on 10 April, the first clean baseline the account has had. The next step is confirming with the MTP sales team that these leads are landing in inboxes and phones, and being followed up.",

  keywordsSubtitle:
    "The people clicking on MTP ads are searching for the brands MTP stocks (Grundfos, Southern Cross) and the services MTP provides (water pump repairs, bore pump repairs, near me). This is high quality traffic that Google Ads is putting through.",
  keywordStats: [
    { value: "760", label: "Distinct searches" },
    { value: "$3,172", label: "Spend (April)" },
    { value: "449", label: "Clicks" },
    { value: "39", label: "Leads (April)" },
    { value: "$81", label: "Account CPA" },
  ],
  keywordRows: [
    { term: "grundfos", clicks: 71, spend: 527, leads: 10 },
    { term: "water pump repairs near me", clicks: 27, spend: 249, leads: 0 },
    { term: "grundfos pumps", clicks: 44, spend: 227, leads: 7 },
    { term: "grundfos australia", clicks: 15, spend: 149, leads: 1 },
    { term: "southern cross pumps", clicks: 18, spend: 108, leads: 0 },
    { term: "water tank pump repairs near me", clicks: 11, spend: 99, leads: 2 },
    { term: "pump repairs near me", clicks: 13, spend: 97, leads: 2 },
    { term: "water pump replacement", clicks: 5, spend: 95, leads: 1 },
    { term: "grundfos pumps australia", clicks: 13, spend: 78, leads: 4 },
    { term: "bore pump repairs near me", clicks: 4, spend: 49, leads: 0 },
    { term: "grundfos pumps perth", clicks: 4, spend: 37, leads: 1 },
    { term: "grundfos water pump", clicks: 13, spend: 32, leads: 2 },
  ],

  nextItems: [
    {
      headline: "Landing page fixes",
      what: "Fixing the top problem pages, missing forms, generic vocabulary, weak emergency intent.",
      why: "We are paying for clicks that land on pages that struggle to convert. Biggest single lift available.",
    },
    {
      headline: "New ad copy and ad groups",
      what: 'Fresh ad copy aligned to landing page intent, plus new ad groups for solar pumps and "near me" geo routing.',
      why: "Captures the emerging solar and local intent that today lands on the wrong page.",
    },
    {
      headline: "Negative keyword pruning",
      what: "Weekly review of search terms to filter out irrelevant queries.",
      why: "Keeps spend on commercial intent only.",
    },
    {
      headline: "Budget reallocation",
      what: "Shift spend from zero converting campaigns into the campaigns producing leads.",
      why: "Brand campaigns drove 68 percent of MTP leads in April. There is headroom to do more there.",
    },
    {
      headline: "SEO recovery",
      what: "Free SEO audit across the site. Diagnose the August 2025 event.",
      why: "The biggest long term lever. Organic traffic is 60 to 70 percent below baseline, fixing it is worth more than any paid optimisation.",
    },
    {
      headline: "Lead validation with the MTP sales team",
      what: "Confirm the 29 leads are landing in inboxes and phones, and being followed up.",
      why: "If leads are arriving and converting, the reporting is trustworthy. If not, it points to a CRM or routing issue to fix together.",
    },
  ],
};
