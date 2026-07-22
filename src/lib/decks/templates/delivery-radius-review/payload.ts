/**
 * Payload schema + sample for the `delivery-radius-review` template.
 *
 * The deck is a 6-slide storefront + local-delivery radius review:
 *   1. Cover
 *   2. 3 km radius — suburb/postcode table + map (suburb rows also carry
 *      their delivery $ and order count)
 *   3. Monthly Delivery vs Pick-up stacked bar chart ($ inside each bar)
 *   4. Channel comparison — KPI cards + free vs paid delivery split
 *   5. Combined GSC + GA4 + Google Ads click-through summary
 *   6. Thank-you close
 *
 * All copy that varies between clients (numbers, suburb names, dates)
 * lives in the payload. Visual chrome and slide ordering live in the
 * React component.
 *
 * `deliveryRadiusReviewSamplePayload` is the verbatim Profiterole
 * Patisserie Roselands review (Jan–Jun 2026).
 */
import type { PayloadSchema } from "../../types";

/* ────────────────────────────────────────────────────────────────── */
/*  Types                                                              */
/* ────────────────────────────────────────────────────────────────── */

export interface SuburbRow {
  /** Display name, e.g. "Wiley Park". */
  name: string;
  /** Distance in kilometres from the store, formatted as a string with 2
   *  decimal places, e.g. "1.86". */
  km: string;
  /** Postcode as a string (zero-padded where applicable), e.g. "2195". */
  postcode: string;
  /** Delivery revenue for this suburb in the review window, formatted
   *  for display, e.g. "$756". Use "—" when the suburb had no delivery
   *  orders in the window. */
  deliverySales: string;
  /** Delivery order count for this suburb in the review window, formatted
   *  for display, e.g. "7". Use "—" when no orders. */
  deliveryOrders: string;
  /** Optional latitude/longitude centroid for the suburb (decimal degrees).
   *  Used to plot the suburb dot on the map. Omit when no good centroid
   *  is available. */
  lat?: number;
  lon?: number;
}

export interface MonthlyBar {
  /** Short month label, e.g. "Jan". */
  label: string;
  /** Delivery revenue for the month, formatted, e.g. "$1,770". */
  delivery: string;
  /** Raw delivery revenue as a number — used by the chart for bar height.
   *  Should equal the numeric value of `delivery`. */
  deliveryValue: number;
  /** Pick-up revenue for the month, formatted, e.g. "$6,451". */
  pickup: string;
  /** Raw pick-up revenue as a number — used by the chart for bar height. */
  pickupValue: number;
}

export interface DeliverySplitRow {
  /** Label, e.g. "Free delivery". */
  label: string;
  /** Sales for the row, formatted, e.g. "$4,016". */
  sales: string;
  /** Order count, formatted, e.g. "45". */
  orders: string;
  /** Average order value, formatted, e.g. "$89.24". */
  avgOrder: string;
  /** Share of total delivery revenue, formatted, e.g. "90.4%". */
  share: string;
}

export interface SourceSummaryRow {
  /** Source label, e.g. "Google Search Console". */
  source: string;
  /** Metric being reported, e.g. "/roselands-cake-shop clicks". */
  metric: string;
  /** Value, formatted for display, e.g. "1,251" or "$640.89". */
  value: string;
  /** Window the metric covers, e.g. "Jan–Jun 2026" or "Last 180 days". */
  window: string;
}

export interface YoyPoint {
  /** X-axis label, e.g. "2021 - 22". */
  label: string;
  /** Bar value formatted for display, e.g. "2,329". */
  bar: string;
  /** Raw bar value — used for bar height. */
  barValue: number;
  /** Line value formatted for display, e.g. "37,865". */
  line: string;
  /** Raw line value — used for line position (independent scale). */
  lineValue: number;
}

export interface ToplineMonth {
  /** Month label, e.g. "January". */
  month: string;
  /** One raw sales value per year in toplineYears order. Use null when the
   *  year has no data for that month (e.g. current FY not yet reached). */
  values: (number | null)[];
}

export interface ServiceItem {
  /** Service name, e.g. "SEO". */
  title: string;
  /** Short description of what the service covers. */
  description: string;
  /** Render greyed out with a "previously managed" treatment. */
  inactive?: boolean;
  /** Optional small note shown when inactive, e.g. "No longer managed". */
  inactiveNote?: string;
}

export interface DeliveryRadiusReviewPayload {
  // --- Cover ---
  /** Client display name, e.g. "Profiterole Patisserie". */
  clientName: string;
  /** External-facing website for the closing CTA link, no trailing slash. */
  clientWebsite: string;
  /** Period covered by the review, e.g. "1 January – 30 June 2026". */
  reviewPeriod: string;
  /** Cover subtitle / tagline. */
  coverTagline: string;
  /** Cover slide smaller line below the tagline (data sources). */
  coverSources: string;

  // --- Slide 2: 3 km radius ---
  /** Radius in km for the suburb list, e.g. 3. */
  radiusKm: number;
  /** Number of suburbs inside the radius (for the header label). */
  suburbCount: number;
  /** Suburb table rows (sorted by ascending km). */
  suburbs: SuburbRow[];
  /** Optional map image (PNG/JPG) to render on the right side. Pass an
   *  absolute URL or a CMS asset path. Omit for a no-map layout. */
  mapImageUrl?: string;
  /** Lat/lng of the store (used to render the map dot when a base map is
   *  drawn, e.g. an inline SVG). */
  storeLat: number;
  storeLon: number;
  /** Total delivery revenue across the radius, formatted, e.g. "$4,441". */
  totalDeliverySales: string;
  /** Total delivery orders across the radius, formatted, e.g. "49". */
  totalDeliveryOrders: string;
  /** Average delivery order value across the radius, formatted, e.g. "$90.63". */
  totalAvgOrder: string;
  /** Footnote text rendered under the table (e.g. shared-postcode notes). */
  suburbFootnote?: string;

  // --- Slide 3: Monthly chart ---
  /** Pre-formatted monthly bars (delivery + pick-up per month). */
  monthlyBars: MonthlyBar[];
  /** Summary line under the chart, e.g.
   *  "Delivery $4,441 (49 cake orders, 15.8%) · Roselands Pick-up $23,602 (347 cake orders, 84.2%) · Combined $28,043".
   */
  monthlySummary: string;

  // --- Slide 4: Channel comparison ---
  /** KPI card titles in order (typically 3: delivery, pick-up, combined). */
  channelTitles: [string, string, string];
  /** KPI card big numbers in order (formatted), e.g. ["$4,441", "$22,184", "$26,625"]. */
  channelValues: [string, string, string];
  /** KPI card first sub-line in order (formatted), e.g. order counts. */
  channelSub1: [string, string, string];
  /** KPI card second sub-line in order (formatted), e.g. share %. */
  channelSub2: [string, string, string];
  /** Free vs paid delivery split rows. */
  deliverySplit: DeliverySplitRow[];
  /** Up to three commentary bullets in the "What this tells us" callout. */
  commentary: string[];

  // --- Slide 5: GSC + GA4 + Ads ---
  /** Three KPI card titles for the click-through summary, e.g.
   *  ["GSC · /roselands-cake-shop", "GA4 · Roselands directions", "Google Shopping · Sydney"].
   */
  sourceCardTitles: [string, string, string];
  /** Three KPI card big numbers, e.g. ["1,251", "171", "1,465"]. */
  sourceCardValues: [string, string, string];
  /** Three KPI card first sub-lines, e.g. metric labels. */
  sourceCardSub1: [string, string, string];
  /** Three KPI card second sub-lines, e.g. supporting context. */
  sourceCardSub2: [string, string, string];
  /** Source detail table (GSC + GA4 + Ads metrics). */
  sourceDetail: SourceSummaryRow[];
  /** Strategic interpretation for the click-through / store-action slide. */
  sourceInsight: string[];

  // --- Appendix: What we do (optional) ---
  /** Slide title, e.g. "What we do". Omit to hide the slide. */
  servicesTitle?: string;
  /** Slide subtitle. */
  servicesSubtitle?: string;
  /** Service cards in display order. Slide renders only when non-empty. */
  services?: ServiceItem[];

  // --- Appendix: Year-on-year growth (optional) ---
  /** Slide title, e.g. "Year-on-year growth". Omit to hide the slide. */
  yoyTitle?: string;
  /** Slide subtitle, e.g. "Items sold vs website traffic by financial year". */
  yoySubtitle?: string;
  /** Legend label for the bars, e.g. "Items sold". */
  yoyBarLabel?: string;
  /** Legend label for the line, e.g. "Traffic". */
  yoyLineLabel?: string;
  /** X-axis caption, e.g. "Financial Years". */
  yoyXAxisLabel?: string;
  /** One point per financial year. Slide renders only when non-empty. */
  yoyPoints?: YoyPoint[];

  // --- Appendix: Topline performance by month (optional) ---
  /** Slide title, e.g. "Topline Performance". Omit to hide the slide. */
  toplineTitle?: string;
  /** Slide subtitle. */
  toplineSubtitle?: string;
  /** Year series labels in draw order, e.g. ["2023", "2024", "2025", "2026"]. */
  toplineYears?: string[];
  /** Twelve months of grouped values. Slide renders only when non-empty. */
  toplineMonths?: ToplineMonth[];
  /** Optional highlight badge, e.g. "Sales +8% YoY". */
  toplineBadge?: string;
  /** Y-axis label, e.g. "Sales". */
  toplineYAxisLabel?: string;

  // --- Slide 6: Thank-you ---
  /** Closing line / CTA. */
  closingLine: string;
  /** Optional secondary line under the closing line. */
  closingSubline?: string;
}

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

function isSuburbRow(v: unknown): v is SuburbRow {
  if (!isObj(v)) return false;
  if (!isStr(v.name) || !isStr(v.km) || !isStr(v.postcode)) return false;
  if (!isStr(v.deliverySales) || !isStr(v.deliveryOrders)) return false;
  if (v.lat !== undefined && !isNum(v.lat)) return false;
  if (v.lon !== undefined && !isNum(v.lon)) return false;
  return true;
}

function isMonthlyBar(v: unknown): v is MonthlyBar {
  return (
    isObj(v) &&
    isStr(v.label) &&
    isStr(v.delivery) &&
    isNum(v.deliveryValue) &&
    isStr(v.pickup) &&
    isNum(v.pickupValue)
  );
}

function isDeliverySplitRow(v: unknown): v is DeliverySplitRow {
  return (
    isObj(v) &&
    isStr(v.label) &&
    isStr(v.sales) &&
    isStr(v.orders) &&
    isStr(v.avgOrder) &&
    isStr(v.share)
  );
}

function isSourceSummaryRow(v: unknown): v is SourceSummaryRow {
  return (
    isObj(v) &&
    isStr(v.source) &&
    isStr(v.metric) &&
    isStr(v.value) &&
    isStr(v.window)
  );
}

function isServiceItem(v: unknown): v is ServiceItem {
  if (!isObj(v)) return false;
  if (!isStr(v.title) || !isStr(v.description)) return false;
  if (v.inactive !== undefined && typeof v.inactive !== "boolean") return false;
  if (v.inactiveNote !== undefined && !isStr(v.inactiveNote)) return false;
  return true;
}

function isYoyPoint(v: unknown): v is YoyPoint {
  return (
    isObj(v) &&
    isStr(v.label) &&
    isStr(v.bar) &&
    isNum(v.barValue) &&
    isStr(v.line) &&
    isNum(v.lineValue)
  );
}

function isToplineMonth(v: unknown): v is ToplineMonth {
  return (
    isObj(v) &&
    isStr(v.month) &&
    Array.isArray(v.values) &&
    v.values.every((x) => x === null || isNum(x))
  );
}

function isTuple3<T>(v: unknown, item: (x: unknown) => x is T): v is [T, T, T] {
  return Array.isArray(v) && v.length === 3 && v.every(item);
}

function parsePayload(input: unknown): DeliveryRadiusReviewPayload {
  if (!isObj(input)) {
    throw new TypeError("delivery-radius-review payload: expected an object");
  }

  const requireStr = (k: keyof DeliveryRadiusReviewPayload): string => {
    const v = input[k as string];
    if (!isStr(v)) {
      throw new TypeError(
        `delivery-radius-review payload: field "${String(k)}" must be a string`,
      );
    }
    return v;
  };
  const requireNum = (k: keyof DeliveryRadiusReviewPayload): number => {
    const v = input[k as string];
    if (!isNum(v)) {
      throw new TypeError(
        `delivery-radius-review payload: field "${String(k)}" must be a number`,
      );
    }
    return v;
  };
  const requireArr = <T>(
    k: keyof DeliveryRadiusReviewPayload,
    item: (x: unknown) => x is T,
  ): T[] => {
    const v = input[k as string];
    if (!isArr(v, item)) {
      throw new TypeError(
        `delivery-radius-review payload: field "${String(k)}" must be an array of valid items`,
      );
    }
    return v;
  };
  const requireStrArr = (k: keyof DeliveryRadiusReviewPayload): string[] => {
    const v = input[k as string];
    if (!isArr(v, isStr)) {
      throw new TypeError(
        `delivery-radius-review payload: field "${String(k)}" must be an array of strings`,
      );
    }
    return v;
  };
  const requireTuple3Str = (
    k: keyof DeliveryRadiusReviewPayload,
  ): [string, string, string] => {
    const v = input[k as string];
    if (!isTuple3(v, isStr)) {
      throw new TypeError(
        `delivery-radius-review payload: field "${String(k)}" must be a 3-tuple of strings`,
      );
    }
    return v;
  };

  const optionalStr = (k: keyof DeliveryRadiusReviewPayload): string | undefined => {
    const v = input[k as string];
    if (v === undefined) return undefined;
    if (!isStr(v)) {
      throw new TypeError(
        `delivery-radius-review payload: field "${String(k)}" must be a string when provided`,
      );
    }
    return v;
  };

  const optionalArr = <T>(
    k: keyof DeliveryRadiusReviewPayload,
    item: (x: unknown) => x is T,
  ): T[] | undefined => {
    const v = input[k as string];
    if (v === undefined) return undefined;
    if (!isArr(v, item)) {
      throw new TypeError(
        `delivery-radius-review payload: field "${String(k)}" must be an array of valid items when provided`,
      );
    }
    return v;
  };

  return {
    clientName: requireStr("clientName"),
    clientWebsite: requireStr("clientWebsite"),
    reviewPeriod: requireStr("reviewPeriod"),
    coverTagline: requireStr("coverTagline"),
    coverSources: requireStr("coverSources"),

    radiusKm: requireNum("radiusKm"),
    suburbCount: requireNum("suburbCount"),
    suburbs: requireArr("suburbs", isSuburbRow),
    mapImageUrl: optionalStr("mapImageUrl"),
    storeLat: requireNum("storeLat"),
    storeLon: requireNum("storeLon"),
    totalDeliverySales: requireStr("totalDeliverySales"),
    totalDeliveryOrders: requireStr("totalDeliveryOrders"),
    totalAvgOrder: requireStr("totalAvgOrder"),
    suburbFootnote: optionalStr("suburbFootnote"),

    monthlyBars: requireArr("monthlyBars", isMonthlyBar),
    monthlySummary: requireStr("monthlySummary"),

    channelTitles: requireTuple3Str("channelTitles"),
    channelValues: requireTuple3Str("channelValues"),
    channelSub1: requireTuple3Str("channelSub1"),
    channelSub2: requireTuple3Str("channelSub2"),
    deliverySplit: requireArr("deliverySplit", isDeliverySplitRow),
    commentary: requireStrArr("commentary"),

    sourceCardTitles: requireTuple3Str("sourceCardTitles"),
    sourceCardValues: requireTuple3Str("sourceCardValues"),
    sourceCardSub1: requireTuple3Str("sourceCardSub1"),
    sourceCardSub2: requireTuple3Str("sourceCardSub2"),
    sourceDetail: requireArr("sourceDetail", isSourceSummaryRow),
    sourceInsight: requireStrArr("sourceInsight"),

    toplineTitle: optionalStr("toplineTitle"),
    toplineSubtitle: optionalStr("toplineSubtitle"),
    toplineYears: (() => {
      const v = input["toplineYears"];
      if (v === undefined) return undefined;
      if (!isArr(v, isStr)) {
        throw new TypeError(
          'delivery-radius-review payload: field "toplineYears" must be an array of strings when provided',
        );
      }
      return v;
    })(),
    toplineMonths: optionalArr("toplineMonths", isToplineMonth),
    toplineBadge: optionalStr("toplineBadge"),
    toplineYAxisLabel: optionalStr("toplineYAxisLabel"),

    servicesTitle: optionalStr("servicesTitle"),
    servicesSubtitle: optionalStr("servicesSubtitle"),
    services: optionalArr("services", isServiceItem),

    yoyTitle: optionalStr("yoyTitle"),
    yoySubtitle: optionalStr("yoySubtitle"),
    yoyBarLabel: optionalStr("yoyBarLabel"),
    yoyLineLabel: optionalStr("yoyLineLabel"),
    yoyXAxisLabel: optionalStr("yoyXAxisLabel"),
    yoyPoints: optionalArr("yoyPoints", isYoyPoint),

    closingLine: requireStr("closingLine"),
    closingSubline: optionalStr("closingSubline"),
  };
}

export const deliveryRadiusReviewSchema: PayloadSchema<DeliveryRadiusReviewPayload> = {
  name: "delivery-radius-review payload",
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
/*  Sample payload — verbatim Profiterole Patisserie Roselands review */
/* ────────────────────────────────────────────────────────────────── */

export const deliveryRadiusReviewSamplePayload: DeliveryRadiusReviewPayload = {
  clientName: "Profiterole Patisserie",
  clientWebsite: "https://www.profiterole.com.au",
  reviewPeriod: "1 January – 30 June 2026",
  coverTagline: "",
  coverSources: "",

  radiusKm: 3,
  suburbCount: 11,
  suburbs: [
    { name: "Roselands",     km: "0.00", postcode: "2196", deliverySales: "$729",  deliveryOrders: "7",  lat: -33.9326, lon: 151.0750 },
    { name: "Kingsgrove",    km: "1.49", postcode: "2208", deliverySales: "$490",  deliveryOrders: "2",  lat: -33.9392, lon: 151.0987 },
    { name: "Lakemba",       km: "1.49", postcode: "2195", deliverySales: "$756",  deliveryOrders: "7",  lat: -33.9206, lon: 151.0762 },
    { name: "Wiley Park",    km: "1.86", postcode: "2195", deliverySales: "—",     deliveryOrders: "—" },
    { name: "Belmore",       km: "2.31", postcode: "2192", deliverySales: "$178",  deliveryOrders: "3",  lat: -33.9111, lon: 151.0889 },
    { name: "Clemton Park",  km: "2.33", postcode: "2206", deliverySales: "$362",  deliveryOrders: "4",  lat: -33.9235, lon: 151.1085 },
    { name: "Narwee",        km: "2.42", postcode: "2209", deliverySales: "$117",  deliveryOrders: "2",  lat: -33.9475, lon: 151.0673 },
    { name: "Campsie",       km: "2.56", postcode: "2194", deliverySales: "$366",  deliveryOrders: "7",  lat: -33.9145, lon: 151.1037 },
    { name: "Bexley North",  km: "2.68", postcode: "2207", deliverySales: "$372",  deliveryOrders: "5",  lat: -33.9413, lon: 151.1120 },
    { name: "Beverly Hills", km: "2.69", postcode: "2209", deliverySales: "—",     deliveryOrders: "—" },
    { name: "Punchbowl",     km: "2.74", postcode: "2196", deliverySales: "$1,800", deliveryOrders: "19", lat: -33.9264, lon: 151.0563 },
  ],
  mapImageUrl: "/partners/profiterole/roselands-3km-map.png",
  storeLat: -33.9317,
  storeLon: 151.0853,
  totalDeliverySales: "$4,441",
  totalDeliveryOrders: "49",
  totalAvgOrder: "$90.63",
  suburbFootnote:
    "Shared postcodes (Wiley Park/Lakemba 2195, Narwee/Beverly Hills 2209): revenue shown on the first suburb in each pair.",

  monthlyBars: [
    { label: "Jan", delivery: "$1,770", deliveryValue: 1770, pickup: "$4,320", pickupValue: 4320 },
    { label: "Feb", delivery: "$355",   deliveryValue: 355,  pickup: "$3,491", pickupValue: 3491 },
    { label: "Mar", delivery: "$643",   deliveryValue: 643,  pickup: "$4,437", pickupValue: 4437 },
    { label: "Apr", delivery: "$561",   deliveryValue: 561,  pickup: "$3,723", pickupValue: 3723 },
    { label: "May", delivery: "$604",   deliveryValue: 604,  pickup: "$5,207", pickupValue: 5207 },
    { label: "Jun", delivery: "$508",   deliveryValue: 508,  pickup: "$2,424", pickupValue: 2424 },
  ],
  monthlySummary:
    "Delivery $4,441 (49 cake orders, 15.8%) · Roselands Pick-up $23,602 (347 cake orders, 84.2%) · Combined $28,043",

  channelTitles: ["Delivery (3 km)", "Roselands Pick-up", "Combined"],
  channelValues: ["$4,441", "$23,602", "$28,043"],
  channelSub1:   ["49 cake orders", "347 cake orders", "396 cake orders"],
  channelSub2:   ["15.8% share", "84.2% share",   "100%"],
  deliverySplit: [
    { label: "Free delivery",  sales: "$4,016", orders: "45", avgOrder: "$89.24",  share: "90.4%" },
    { label: "Paid delivery",  sales: "$425",   orders: "4",  avgOrder: "$106.25", share: "9.6%"  },
    { label: "Total delivery", sales: "$4,441", orders: "49", avgOrder: "$90.63",  share: "100%"  },
  ],
  commentary: [
    "Pick-up is ~5× delivery revenue in the same 3 km catchment — distance is not the constraint.",
    "Only 4 paid-delivery cake orders in 6 months — the paid-delivery mechanic is rarely being triggered.",
    "Free-delivery cake orders average $89 — high enough that the free-delivery promo is paying for itself in AOV.",
  ],

  sourceCardTitles: ["Google Ads", "Organic search", "Google Business Profile"],
  sourceCardValues: ["1,465",  "1,251",   "4,126+"],
  sourceCardSub1:   ["Clicks", "Clicks", "Directions + calls"],
  sourceCardSub2:   ["Shopping campaign", "Search Console", "2,961 directions · 1,165 calls"],
  sourceDetail: [
    { source: "Google Ads",              metric: "shopping_sydney_product clicks",                value: "1,465", window: "Jan–Jun 2026" },
    { source: "Organic search",          metric: "/roselands-cake-shop clicks",                   value: "1,251", window: "Jan–Jun 2026" },
    { source: "On-site map",             metric: "Roselands footer map clicks",                  value: "171",   window: "Last 180 days" },
    { source: "Google Business Profile", metric: "Direction requests",                           value: "2,961", window: "Jan–Jun 2026" },
    { source: "Google Business Profile", metric: "Calls from Business Profile",                  value: "1,165", window: "Jan–Jun 2026" },
    { source: "Google Business Profile", metric: "Non-branded profile visits",                   value: "~7,000", window: "Jan–Jun 2026" },
    { source: "Email marketing",         metric: "Roselands orders added to newsletter (accepts marketing) · emailed 2–3×/month · 9,778 Sydney subscribers in total, many within a reasonable radius of Roselands", value: "226", window: "Jan–Jun 2026" },
  ],
  sourceInsight: [
    "Reminder: the work driving local demand is broader than one ad channel — SEO, Google Ads, Meta Ads, website/e-commerce updates, Google Review responses, Google Business Profile posts and organic articles all contribute.",
    "Google Business Profile produced 2,961 direction requests and 1,165 calls, showing the work is driving real store intent and foot traffic beyond website orders.",
    "There were ~7,000 Business Profile visits from non-Profiterole Patisserie searches from January to June, meaning discovery work is creating demand not fully counted in the delivery/pick-up sales data.",
  ],

  servicesTitle: "What Optimise Digital does",
  servicesSubtitle: "The digital marketing engine behind profiterole.com.au",
  services: [
    { title: "Website management", description: "We manage the entire website: ongoing updates, new store pages, individual store content, delivery content and product management, including editing products." },
    { title: "SEO", description: "Search engine optimisation across the website: rankings, technical health and local visibility." },
    { title: "Google Ads", description: "Campaign management and optimisation driving traffic and cake orders." },
    { title: "Paid social ads", description: "Paid social advertising: planning, creative and performance." },
    { title: "Social media", description: "Organic social content and community management.", inactive: true, inactiveNote: "No longer managed" },
    { title: "Email marketing", description: "Newsletter campaigns to the accepts-marketing database, 2 to 3 sends per month." },
    { title: "Google Business Profile", description: "Profile management, posts and review management across store locations." },
    { title: "Marketing strategy", description: "Marketing strategy and tactics, plus photography for the website and campaigns." },
  ],

  yoyTitle: "Year-on-year growth",
  yoySubtitle: "Cakes sold vs website traffic by financial year",
  yoyBarLabel: "Cakes sold",
  yoyLineLabel: "Traffic",
  yoyXAxisLabel: "Financial Years",
  yoyPoints: [
    { label: "2021 - 22", bar: "2,329", barValue: 2329, line: "37,865", lineValue: 37865 },
    { label: "2022 - 23", bar: "2,487", barValue: 2487, line: "38,813", lineValue: 38813 },
    { label: "2023 - 24", bar: "2,948", barValue: 2948, line: "57,339", lineValue: 57339 },
    { label: "2024 - 25", bar: "4,553", barValue: 4553, line: "64,799", lineValue: 64799 },
    { label: "2025 - 26", bar: "6,393", barValue: 6393, line: "96,578", lineValue: 96578 },
  ],

  toplineTitle: "Month on Month Performance by Year",
  toplineYears: ["2023", "2024", "2025", "2026"],
  // 2023 values estimated from chart bar heights (no labels in source).
  toplineMonths: [
    { month: "Jan", values: [11500, 11495, 17753, 36254] },
    { month: "Feb", values: [9000,  11663, 19351, 31486] },
    { month: "Mar", values: [11000, 20405, 23937, 37294] },
    { month: "Apr", values: [12500, 15905, 27231, 35682] },
    { month: "May", values: [12000, 20257, 35008, 43211] },
    { month: "Jun", values: [11500, 12543, 28143, 30309] },
    { month: "Jul", values: [14500, 15615, 23431, null] },
    { month: "Aug", values: [14000, 18471, 31641, null] },
    { month: "Sep", values: [15000, 19978, 38557, null] },
    { month: "Oct", values: [13000, 25153, 38009, null] },
    { month: "Nov", values: [16000, 25177, 33668, null] },
    { month: "Dec", values: [21500, 44084, 70989, null] },
  ],
  toplineYAxisLabel: "Sales",

  closingLine: "Thank you",
  closingSubline:
    "Happy to provide additional cuts on request — per-postcode free/paid, AOV by channel, weekly seasonality, or 5 km / 7 km radius comparison.",
};