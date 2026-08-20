/**
 * Real section structure of the deployed landing pages, keyed by page_id.
 *
 * Source of truth is the landing repo (away-digital-team-lp): the ids are the
 * `data-track-section` attributes the SDK reports in section_dwell events, and
 * the order is the actual DOM order of the page. The dashboard uses this to
 * show "where people spend their time" in page order with human labels —
 * including sections nobody reached, which event data alone can never list —
 * and to scroll the embedded page preview to a section.
 *
 * simplification: a hand-maintained map, updated when the landing page's
 * sections change. The ceiling is a stale dashboard label (events still
 * report; unknown ids fall back to the raw id). Upgrade path: have the landing
 * build emit a sections manifest the CMS fetches.
 */

export interface LandingSection {
  /** `data-track-section` value — matches section_dwell's sectionId. */
  id: string;
  label: string;
  /** In-page anchor for the preview iframe; null = scroll to top / no anchor. */
  anchor: string | null;
}

export interface LandingPageMeta {
  pageId: string;
  label: string;
  /** Publicly served URL, embeddable by the CMS via frame-ancestors. */
  url: string;
  sections: LandingSection[];
  /**
   * Section the primary goal is completed in. A conversion can be recorded
   * while this section never registers as seen (it is revealed late and may
   * never clear the 50% visibility bar), which reads as a contradiction next to
   * the conversion count unless the dashboard says so.
   */
  goalSectionId?: string;
}

/**
 * AU and US market pages share one template; the US build only removes the
 * time-overlap block, which is not a tracked section.
 *
 * Labels are the section's own on-page heading, verbatim, and the array is in
 * the page's DOM order top-to-bottom. Both are deliberate: the dashboard row
 * has to be findable on the page it describes, so a paraphrased label ("Key
 * sectors" for a section headed "We hire for these key sectors") makes the
 * reader hunt for the block the number belongs to.
 */
const MARKET_SECTIONS: LandingSection[] = [
  // The hero leads with the page h1; every other row is its h2.
  { id: "hero", label: "Outsourcing, done better", anchor: null },
  { id: "logostrip", label: "Trusted by 200+ companies", anchor: "logostrip-h" },
  { id: "compare", label: "Vietnam vs. the alternatives", anchor: "compare" },
  { id: "concerns", label: "The most common concerns we hear", anchor: "concerns-h" },
  { id: "how", label: "How it Works", anchor: "how" },
  { id: "tools", label: "Are you ready to outsource?", anchor: "tools" },
  { id: "sectors", label: "We hire for these key sectors. Here are the facts.", anchor: "sectors" },
  { id: "why-vietnam", label: "Why Vietnam?", anchor: "why-vietnam" },
  { id: "detail", label: "How working with Away Digital Teams looks", anchor: "detail-h" },
  { id: "approach", label: "What makes outsourcing with us different?", anchor: "approach" },
  { id: "proof", label: "200+ companies grow faster with our top-tier talent.", anchor: "proof" },
  { id: "faqs", label: "FAQs", anchor: "faqs" },
  { id: "contact", label: "Talk to our team", anchor: "contact" },
  // Revealed at form step 6, so it carries its own h3 and no static anchor.
  { id: "booking", label: "Choose your time", anchor: null },
];

/**
 * The live public domain. Previews embed these URLs in an iframe, which the
 * landing project permits through its frame-ancestors header — a domain change
 * here needs the matching entry there, and in the property's allowedOrigins, or
 * the preview blanks and ingest refuses the new origin.
 */
const BASE = "https://hire.awaydigitalteams.com";

export const LANDING_PAGES: Record<string, LandingPageMeta> = {
  "offshore-teams-au": {
    pageId: "offshore-teams-au",
    label: "AU: Outsourcing to Vietnam",
    url: `${BASE}/outsourcing-au`,
    sections: MARKET_SECTIONS,
    goalSectionId: "booking",
  },
  "offshore-teams-us": {
    pageId: "offshore-teams-us",
    label: "US: Offshore Teams in Vietnam",
    url: `${BASE}/outsourcing-us`,
    sections: MARKET_SECTIONS,
    goalSectionId: "booking",
  },
};

/**
 * Ad-group pages are derived from their page_id, not listed here.
 *
 * The landing build generates one page per search intent from the same source
 * as the market pages, so the section structure is identical and the id encodes
 * the path: `ag-bpo-services-au` is served at `/lp/bpo-services-au`. Deriving it
 * means a page added over there needs no edit here - which matters, because the
 * previous hand-maintained map is exactly what broke the dashboard: an id it did
 * not recognise made the whole report fall back to "no template", taking the
 * preview with it.
 */
const AD_GROUP_PAGE_ID = /^ag-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** Words that read wrong in title case; the market suffix is shown separately. */
const ACRONYMS = new Set(["bpo", "rpo", "cx", "hr", "it"]);

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((word) => (ACRONYMS.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/**
 * Resolve any landing page_id to the page it describes, or null if the id is not
 * one of ours.
 *
 * The id reaches here from stored events, which originate in a browser, so it is
 * untrusted. The pattern above admits only lowercase alphanumerics and single
 * hyphens, and the URL is always built against `BASE` - a crafted id can never
 * point the preview iframe at another origin, only at a path on our own site.
 */
export function resolveLandingPage(pageId: string): LandingPageMeta | null {
  const known = LANDING_PAGES[pageId];
  if (known) return known;

  const slug = AD_GROUP_PAGE_ID.exec(pageId)?.[1];
  if (!slug) return null;

  const market = /-(au|us)$/.exec(slug)?.[1];
  const name = titleCase(market ? slug.slice(0, -3) : slug);

  return {
    pageId,
    label: market ? `${market.toUpperCase()}: ${name}` : name,
    url: `${BASE}/lp/${slug}`,
    sections: MARKET_SECTIONS,
    goalSectionId: "booking",
  };
}
