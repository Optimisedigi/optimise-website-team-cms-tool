/**
 * Pure-function deck template generator.
 *
 * Given a validated DeckPayload, produces the verbatim `globals.css` and
 * `page.tsx` strings that the apply handler writes to disk under
 * `src/app/(frontend)/partners/google-ads-audit/<slug>/`.
 *
 * v1 ships the 5-slide template: cover, shipped, leads, keywords, next.
 * The 6th channel slide (LineChart) is deferred until the GA4 tool returns
 * a monthly series — see the plan's "v1 simplification on the Channel
 * slide" section.
 *
 * Brand-voice rules enforced here at generation time:
 *   - The `produced` bullets accept inline **bold** markdown which we
 *     compile down to <strong>…</strong> JSX so the deck can highlight a
 *     headline number per row. Everything else renders as plain text.
 *   - All user-supplied strings flow through `j()` to escape backticks,
 *     dollar signs and backslashes — JSX is emitted as a template literal
 *     so unescaped values would otherwise break the build.
 */

export interface KeywordStat {
  /** Display value e.g. "$81" or "1,610". */
  value: string;
  /** Tile label e.g. "Account CPA". */
  label: string;
}

export interface KeywordRow {
  term: string;
  clicks: number;
  /** Dollars; SearchTermsSlide renders `$<spend>` itself. */
  spend: number;
  leads: number;
}

export interface NextItem {
  headline: string;
  what: string;
  why: string;
}

export interface DeckPayload {
  /** Long form e.g. "Malcolm Thompson Pumps". */
  clientName: string;
  /** Short form e.g. "MTP". Used in slide headings/copy. */
  shortName: string;
  /** URL slug — produces the folder name. */
  slug: string;
  /** When the new structure went live (YYYY-MM-DD). */
  launchDate: string;
  /** "Today" in the deck's voice (YYYY-MM-DD). */
  reviewDate: string;

  /** Left blue "What we did" column bullets. Plain text. */
  shippedDid: string[];
  /**
   * Right emerald "What it produced" column bullets. Each may contain
   * inline **bold** markdown spans that we render as <strong>.
   */
  shippedProduced: string[];

  /** Leads slide */
  formsLeads: number;
  phonesLeads: number;
  /** 1–3 sentence paragraph below the tiles. */
  leadsCopy: string;

  /** Keywords slide */
  keywordsSubtitle: string;
  keywordStats: KeywordStat[];
  keywordRows: KeywordRow[];

  /** Next slide: exactly 6 workstreams. */
  nextItems: NextItem[];
}

/* ────────────────────────────────────────────────────────────────── */
/*  globals.css — verbatim baseline shared across all decks            */
/* ────────────────────────────────────────────────────────────────── */

export const DECK_GLOBALS_CSS = `@import "tailwindcss";

/* The (frontend) layout's styles.css applies element defaults (h1 margins,
   font sizes, etc.) inside @layer base. Tailwind v4 utilities live in
   @layer utilities and beat @layer base, but the parent styles.css is
   loaded *after* Tailwind so its base rules still cascade. These
   unlayered margin resets win on the team-session route only, so deck
   spacing is not blown out by the parent's h1 { margin: 40px 0 } etc. */
/* Use margin-block (top/bottom only), NOT the margin shorthand, so the
   unlayered reset doesn't clobber Tailwind's mx-auto utility on h-tags
   and p elements (mx-auto sets margin-inline: auto and is in @layer
   utilities, which loses to anything unlayered). */
h1, h2, h3, h4, h5, h6, p {
  margin-block: 0;
}

/* The parent layout sets html { background: black } and body
   { color: white; font-size: 18px; line-height: 32px; font-family: system-ui }.
   Reset to a neutral baseline so deck Tailwind utilities (bg-white,
   text-slate-*, text-base, etc.) render predictably on this route. */
html, body {
  background: white;
  color: rgb(15, 23, 42);
  font-size: 16px;
  line-height: 1.5;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  -webkit-font-smoothing: antialiased;
}
`;

/* ────────────────────────────────────────────────────────────────── */
/*  String helpers                                                    */
/* ────────────────────────────────────────────────────────────────── */

/**
 * Escape a string for embedding inside a JSX double-quoted attribute or
 * a JSX child string literal. We rewrite `"` to `&quot;` and backslashes
 * to `\\` because page.tsx is written as a TypeScript file and the
 * compiler will re-interpret backslash escapes otherwise.
 */
function jsxString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, "&quot;");
}

/**
 * Escape a string for use inside a JSX text node (between tags, not in
 * an attribute). Curly braces would otherwise be parsed as expression
 * delimiters; we wrap any string that contains them in a `{"…"}` block.
 *
 * For simplicity we always emit JSX children as `{"…"}` string
 * expressions — that way one path covers braces, ampersands, angle
 * brackets and quotes without us re-implementing JSX's text-node
 * parser. The cost is one extra pair of braces per string, which is
 * fine for a generated file.
 */
function jsxChild(s: string): string {
  // Inside a JS string literal: escape backslash, then backtick is fine
  // since we emit double-quoted strings; escape double-quote.
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Compile a "produced" bullet that may contain inline **bold** markdown
 * into a JSX fragment string. The two MTP/Berendsen decks use this
 * pattern verbatim:
 *
 *   <><strong>29 leads</strong> since 10 April (14 form, 15 phone)</>
 *
 * Algorithm: split on `**…**` runs, render bold runs as <strong>…</strong>
 * and plain runs as `{"…"}` expression children.
 */
function compileBoldFragment(input: string): string {
  // Split keeping the matched groups. The regex captures the inner text
  // of every **bold** span.
  const parts = input.split(/\*\*([^*]+?)\*\*/g);
  // parts alternates: [plain, bold, plain, bold, ..., plain]
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (i % 2 === 1) {
      // bold run
      out.push(`<strong>{${jsxChild(seg)}}</strong>`);
    } else if (seg.length > 0) {
      out.push(`{${jsxChild(seg)}}`);
    }
  }
  return `<>${out.join("")}</>`;
}

/* ────────────────────────────────────────────────────────────────── */
/*  Date arithmetic for the cover slide                               */
/* ────────────────────────────────────────────────────────────────── */

/**
 * Days elapsed between two YYYY-MM-DD dates, inclusive of the start day
 * (i.e. "26 days into new structure" for launchDate 10 April and
 * reviewDate 5 May = 26). Returns 0 if dates are invalid.
 */
export function daysSinceLaunch(launchDate: string, reviewDate: string): number {
  const a = Date.parse(launchDate);
  const b = Date.parse(reviewDate);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  const days = Math.round((b - a) / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

/* ────────────────────────────────────────────────────────────────── */
/*  generateDeckTsx                                                   */
/* ────────────────────────────────────────────────────────────────── */

/** Render an array of strings as a JSX list of bullet entries. */
function renderShippedDid(items: string[]): string {
  return items.map((s) => `          ${jsxChild(s)},`).join("\n");
}

function renderShippedProduced(items: string[]): string {
  return items.map((s) => `          ${compileBoldFragment(s)},`).join("\n");
}

function renderKeywordStats(stats: KeywordStat[]): string {
  return stats
    .map(
      (s) =>
        `          { v: ${jsxChild(s.value)}, l: ${jsxChild(s.label)} },`,
    )
    .join("\n");
}

function renderKeywordRows(rows: KeywordRow[]): string {
  return rows
    .map(
      (r) =>
        `          { term: ${jsxChild(r.term)}, clicks: ${r.clicks}, spend: ${r.spend}, leads: ${r.leads} },`,
    )
    .join("\n");
}

function renderNextItems(items: NextItem[]): string {
  return items
    .map(
      (it) =>
        `          [\n            ${jsxChild(it.headline)},\n            ${jsxChild(it.what)},\n            ${jsxChild(it.why)},\n          ],`,
    )
    .join("\n");
}

/**
 * Build the full page.tsx contents for a stakeholder deck.
 *
 * Output is deterministic — for the same input payload the same string
 * comes out, so the apply handler's git commit is reviewable and tests
 * can snapshot the round-trip.
 */
export function generateDeckTsx(payload: DeckPayload): string {
  const days = daysSinceLaunch(payload.launchDate, payload.reviewDate);
  // Slot the cover headline copy together. We use the same "x days into
  // new structure" phrasing the MTP deck uses, lifted to a top-line
  // tagline. The CoverSlide primitive only accepts `clientName` so the
  // days-into-structure note lives in the JSX below the cover.
  const coverDaysLine = `${days} day${days === 1 ? "" : "s"} into the new structure`;

  return `"use client";

import "./globals.css";
import {
  CoverSlide,
  LeadsSlide,
  NextSlide,
  PrintStyles,
  ProgressBar,
  SearchTermsSlide,
  ShippedSlide,
} from "../_deck-primitives";

const SLIDES = [
  "cover",
  "shipped",
  "leads",
  "keywords",
  "next",
];

export default function ${slugToComponentName(payload.slug)}() {
  return (
    <div data-deck-days={${jsxChild(coverDaysLine)}}>
      <PrintStyles />
      <ProgressBar />

      {/* 1. Cover */}
      <CoverSlide slides={SLIDES} clientName=${`"${jsxString(payload.clientName)}"`} />

      {/* 2. What we shipped, what it produced */}
      <ShippedSlide
        id="shipped"
        slides={SLIDES}
        client=${`"${jsxString(payload.shortName)}"`}
        did={[
${renderShippedDid(payload.shippedDid)}
        ]}
        produced={[
${renderShippedProduced(payload.shippedProduced)}
        ]}
      />

      {/* 3. Leads */}
      <LeadsSlide
        id="leads"
        slides={SLIDES}
        client=${`"${jsxString(payload.shortName)}"`}
        forms={${payload.formsLeads}}
        phones={${payload.phonesLeads}}
        total={${payload.formsLeads + payload.phonesLeads}}
        copy=${`{${jsxChild(payload.leadsCopy)}}`}
      />

      {/* 4. Keywords */}
      <SearchTermsSlide
        id="keywords"
        slides={SLIDES}
        client=${`"${jsxString(payload.shortName)}"`}
        subtitle=${`{${jsxChild(payload.keywordsSubtitle)}}`}
        stats={[
${renderKeywordStats(payload.keywordStats)}
        ]}
        rows={[
${renderKeywordRows(payload.keywordRows)}
        ]}
      />

      {/* 5. What is next */}
      <NextSlide
        id="next"
        slides={SLIDES}
        client=${`"${jsxString(payload.shortName)}"`}
        items={[
${renderNextItems(payload.nextItems)}
        ]}
      />
    </div>
  );
}
`;
}

/**
 * Convert a slug like `may-2026-mtp-recap` to a PascalCase React
 * component name like `May2026MtpRecapDeckPage`. Used as the default
 * export's function name so the generated file reads naturally.
 */
export function slugToComponentName(slug: string): string {
  const parts = slug
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  const joined = parts.join("");
  // Function names must start with a letter — prefix a digit-led slug.
  const safe = /^[A-Za-z_]/.test(joined) ? joined : `Deck${joined}`;
  return `${safe}DeckPage`;
}
