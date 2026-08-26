/**
 * The category and market a landing page belongs to.
 *
 * Both are read off data the landing build already emits rather than a second
 * list kept here: the ad-group build names every role campaign
 * `Category – <sector> – <market> – Exact`, and every page carries its own
 * market. A local role-to-sector table would be a copy that silently drifts the
 * first time a role moves sector.
 *
 * Anything whose campaign is not one of those `Category –` campaigns is generic:
 * the service and Vietnam-intent pages (outsourcing services, BPO, RPO, Vietnam
 * developers/marketing/accounting) sit in their own campaigns and are grouped
 * together, which is how they are bought and how they are read.
 */

export type LandingCategory = "generic" | "it" | "marketing" | "finance-admin";

export const LANDING_CATEGORY_LABELS: Record<LandingCategory, string> = {
  generic: "Generic & Vietnam outsourcing",
  it: "Developer / IT",
  marketing: "Marketing & Graphics",
  "finance-admin": "Finance & Admin",
};

export type LandingMarket = "AU" | "US";

/** Which category a page's campaign puts it in. */
export function landingPageCategory(campaign?: string): LandingCategory {
  const name = (campaign ?? "").toLowerCase();
  // Only the build's own `Category – …` campaigns name a sector. Everything
  // else - generic service campaigns, brand, anything new - is generic, so an
  // unrecognised campaign is never silently filed under a sector it isn't in.
  if (!name.includes("category")) return "generic";
  if (name.includes("developer") || /\bit\b/.test(name) || name.includes("tech")) return "it";
  if (name.includes("marketing") || name.includes("graphic")) return "marketing";
  if (name.includes("finance") || name.includes("admin") || name.includes("data entry")) {
    return "finance-admin";
  }
  return "generic";
}

/**
 * The market a page targets.
 *
 * The manifest value wins; the `-us`/`-au` slug suffix is the fallback for the
 * legacy pages that predate the field. Returns null when neither says.
 */
export function landingPageMarket(market?: string, pageId?: string): LandingMarket | null {
  const declared = (market ?? "").trim().toUpperCase();
  if (declared === "AU" || declared === "US") return declared;
  const id = (pageId ?? "").toLowerCase();
  if (id.endsWith("-us")) return "US";
  if (id.endsWith("-au")) return "AU";
  return null;
}
