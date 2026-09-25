import { isAwayDigitalSlug } from "@/lib/away-digital";
import { zonedDay } from "@/lib/landing-date-range";

/**
 * Page layouts the Away Digital landing pages have been served in.
 *
 * The pages were rebuilt in place (new section order, new sections), and the
 * events carry no layout marker, so the only thing separating "old page" data
 * from "new page" data is the moment the new build went live. The dashboard
 * splits on that moment at read time: nothing stored is changed, so switching
 * back or moving the cutover is a code change, never a data repair.
 *
 * `current` is the default so the link the client already has opens on the
 * page they are looking at today.
 */
export type LandingLayoutId = "current" | "original";

/**
 * When the all-pages deploy of the new layout completed (Vercel deployment
 * od-landing-page-a98v7pzq9, commit d3b445d): 25 Sep 2026, 2:12am Sydney.
 * The US market page switched ~11 minutes earlier; that window reads as
 * "original", which is negligible.
 */
export const AWAY_LAYOUT_CUTOVER = "2026-09-24T16:12:36.000Z";

/** Anything but an explicit "original" is the current layout. */
export function parseLayout(value: string | null | undefined): LandingLayoutId {
  return value === "original" ? "original" : "current";
}

/** Only Away Digital has more than one layout; every other client is unfiltered. */
export function hasLayouts(slug: string): boolean {
  return isAwayDigitalSlug(slug);
}

export interface LayoutWindow {
  since: string;
  until: string;
  /** True when the requested range lies entirely outside the layout's lifetime. */
  empty: boolean;
}

/**
 * Narrow an ISO `[since, until)` range to the lifetime of one layout.
 *
 * `current` starts at the cutover; `original` ends at it. The range is never
 * widened. An empty result keeps `since === until`, so any query built from it
 * matches nothing rather than erroring.
 */
export function clampToLayout(layout: LandingLayoutId, since: string, until: string): LayoutWindow {
  const cutover = AWAY_LAYOUT_CUTOVER;
  if (layout === "current") {
    const start = since > cutover ? since : cutover;
    return start < until ? { since: start, until, empty: false } : { since: until, until, empty: true };
  }
  const end = until < cutover ? until : cutover;
  return since < end ? { since, until: end, empty: false } : { since, until: since, empty: true };
}

/**
 * The Google Ads date range (`YYYY-MM-DD,YYYY-MM-DD`, reporting-zone days) that
 * matches a layout window, or null when the ads range should not be queried.
 *
 * Ads report whole days, so the cutover day (which is almost entirely new
 * layout) belongs to the current layout and the original layout's ads end the
 * day before. Returns `fallback` untouched when the layout did not narrow the
 * range, so an unclamped report asks Google Ads exactly what it asked before.
 */
export function layoutAdsDateRange(
  layout: LandingLayoutId,
  requested: { since: string; until: string },
  window: LayoutWindow,
  fallback: string,
): string | null {
  if (window.empty) return null;
  if (window.since === requested.since && window.until === requested.until) return fallback;
  const cutoverDay = zonedDay(new Date(AWAY_LAYOUT_CUTOVER));
  const start = zonedDay(new Date(window.since));
  let end = zonedDay(new Date(Date.parse(window.until) - 1));
  if (layout === "original" && window.until === AWAY_LAYOUT_CUTOVER) {
    end = new Date(Date.parse(`${cutoverDay}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);
  }
  return start <= end ? `${start},${end}` : null;
}
