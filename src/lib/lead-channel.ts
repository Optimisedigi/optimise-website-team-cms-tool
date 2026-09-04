/**
 * Sales-lead acquisition channels and inbound form attribution.
 *
 * Referrer URLs and UTM fields are untrusted visitor input. Channel is chosen
 * from a fixed enum via hostname / source allowlists — never from raw strings.
 */

export const LEAD_CHANNEL_OPTIONS = [
  { label: "Organic Search", value: "organic_search" },
  { label: "Paid Search (Google Ads)", value: "paid_search" },
  { label: "Paid Social (Meta Ads)", value: "paid_social" },
  { label: "Organic Social", value: "organic_social" },
  { label: "AI Chat", value: "ai_chat" },
  { label: "Website (Other)", value: "website_other" },
  { label: "Referral", value: "referral" },
  { label: "Referral Partner", value: "referral_partner" },
  { label: "BNI Referral", value: "bni_referral" },
  { label: "Cold Outreach", value: "cold_outreach" },
] as const;

export type Channel = (typeof LEAD_CHANNEL_OPTIONS)[number]["value"];

export interface Attribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  gclid?: string;
  fbclid?: string;
  referrerUrl?: string;
  landingPage?: string;
  heardAbout?: string;
}

const ORGANIC_SEARCH_DOMAINS = [
  "google.",
  "bing.",
  "yahoo.",
  "duckduckgo.",
  "baidu.",
  "yandex.",
  "ecosia.",
];

const SOCIAL_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "tiktok.com",
  "reddit.com",
  "threads.net",
  "pinterest.com",
];

const SOCIAL_SOURCES = [
  "facebook",
  "instagram",
  "linkedin",
  "twitter",
  "youtube",
  "tiktok",
  "reddit",
  "threads",
  "pinterest",
  "meta",
  "fb",
];

/** Exact host or subdomain of these hosts only — never substring-match the raw URL. */
const AI_CHAT_HOSTS = [
  "chatgpt.com",
  "chat.openai.com",
  "openai.com",
  "claude.ai",
  "anthropic.com",
  "gemini.google.com",
  "bard.google.com",
  "copilot.microsoft.com",
  "perplexity.ai",
  "poe.com",
  "you.com",
  "grok.com",
  "grok.x.ai",
  "x.ai",
  "deepseek.com",
  "meta.ai",
  "mistral.ai",
  "character.ai",
];

const AI_CHAT_SOURCES = [
  "chatgpt",
  "openai",
  "claude",
  "anthropic",
  "gemini",
  "bard",
  "perplexity",
  "copilot",
  "grok",
  "poe",
  "you.com",
  "deepseek",
  "mistral",
  "character.ai",
];

function referrerHostname(referrer: string): string | null {
  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function hostnameIs(hostname: string, hosts: readonly string[]): boolean {
  return hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

export function attributeChannel(attrs: Attribution): {
  channel: Channel;
  channelDetail: string;
} {
  const source = (attrs.utmSource || "").toLowerCase().trim();
  const medium = (attrs.utmMedium || "").toLowerCase().trim();
  const campaign = attrs.utmCampaign || "";
  const referrer = (attrs.referrerUrl || "").toLowerCase();
  const hostname = referrer ? referrerHostname(referrer) : null;
  const heardAbout = (attrs.heardAbout || "").toLowerCase().trim();

  // 1. Google Ads: gclid present OR google + cpc/paid
  if (
    attrs.gclid ||
    (source === "google" && (medium === "cpc" || medium === "paid"))
  ) {
    return {
      channel: "paid_search",
      channelDetail:
        campaign ||
        `Google Ads${attrs.gclid ? ` (gclid: ${attrs.gclid.slice(0, 20)}...)` : ""}`,
    };
  }

  // 2. Meta Ads: fbclid present OR facebook/meta/instagram + cpc/paid/paidsocial
  if (
    attrs.fbclid ||
    ((source === "facebook" ||
      source === "meta" ||
      source === "instagram" ||
      source === "fb") &&
      (medium === "cpc" ||
        medium === "paid" ||
        medium === "paidsocial" ||
        medium === "paid_social"))
  ) {
    return {
      channel: "paid_social",
      channelDetail: campaign || `Meta Ads${attrs.fbclid ? ` (fbclid)` : ""}`,
    };
  }

  // 3. AI chat — before organic search so gemini.google.com is not tagged as Google.
  if (
    AI_CHAT_SOURCES.includes(source) ||
    (hostname && hostnameIs(hostname, AI_CHAT_HOSTS)) ||
    heardAbout === "chatgpt-or-ai" ||
    heardAbout.includes("chatgpt") ||
    heardAbout.includes("ai chat")
  ) {
    return {
      channel: "ai_chat",
      channelDetail: source || hostname || heardAbout || referrer,
    };
  }

  // 4. Organic search: utm_medium=organic OR referrer is a search engine
  if (medium === "organic") {
    return {
      channel: "organic_search",
      channelDetail: source || "organic",
    };
  }

  if (referrer && ORGANIC_SEARCH_DOMAINS.some((d) => referrer.includes(d))) {
    return {
      channel: "organic_search",
      channelDetail: referrer,
    };
  }

  // 5. Organic social
  if (medium === "social" || medium === "organic_social") {
    return {
      channel: "organic_social",
      channelDetail: source || "social",
    };
  }

  if (SOCIAL_SOURCES.includes(source)) {
    return {
      channel: "organic_social",
      channelDetail: source,
    };
  }

  if (referrer && SOCIAL_DOMAINS.some((d) => referrer.includes(d))) {
    return {
      channel: "organic_social",
      channelDetail: referrer,
    };
  }

  return {
    channel: "website_other",
    channelDetail: [source, medium, campaign].filter(Boolean).join(" / ") || "direct / unknown",
  };
}
