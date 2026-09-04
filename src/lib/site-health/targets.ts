/** Crawl URL and client-email recipients for a monthly health run.
 *  Overrides on seoAuto win; otherwise use the client's website and contact. */

export function withHttps(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function resolveSiteHealthCrawlUrl(client: {
  seoAuto?: { siteUrl?: string | null } | null;
  websiteUrl?: string | null;
}): string {
  return withHttps(client.seoAuto?.siteUrl || client.websiteUrl || "");
}

export function resolveSiteHealthEmails(client: {
  seoAuto?: { notificationEmails?: Array<{ email?: string | null } | string> | null } | null;
  contactEmail?: string | null;
}): string[] {
  const fromMonitor = (client.seoAuto?.notificationEmails || [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.email || ""))
    .map((email) => email.trim())
    .filter(Boolean);
  if (fromMonitor.length > 0) return fromMonitor;
  const fallback = (client.contactEmail || "").trim();
  return fallback ? [fallback] : [];
}
