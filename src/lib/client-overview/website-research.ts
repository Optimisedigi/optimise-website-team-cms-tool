/**
 * Reads a client's public website so the "Who is this client?" draft can be
 * written from what the business says about itself.
 *
 * The URL comes from a staff-editable client field, and the fetch runs on our
 * server, so every hop is checked before it is requested: http(s) only, default
 * ports only, no credentials in the URL, and the hostname must resolve to
 * public addresses (no loopback, private, link-local or metadata ranges).
 * Redirects are followed by hand so each target gets the same check. Bodies
 * are capped in size and every request has a timeout.
 *
 * Page text is untrusted. It only ever reaches the LLM as quoted data and the
 * result goes to a human approval queue before it is written anywhere.
 */

import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export type LookupFn = (hostname: string) => Promise<string[]>;

export interface ResearchedPage {
  url: string;
  title: string;
  description: string;
  text: string;
}

export type WebsiteResearchResult =
  | { ok: true; siteUrl: string; pages: ResearchedPage[] }
  | { ok: false; reason: string };

const MAX_REDIRECTS = 4;
const MAX_BODY_BYTES = 2_000_000;
const PAGE_TIMEOUT_MS = 12_000;
const MAX_PAGE_TEXT_CHARS = 6_000;
const MAX_EXTRA_PAGES = 2;
const USER_AGENT =
  "Mozilla/5.0 (compatible; OptimiseDigitalCMS/1.0; +https://optimisedigital.online)";

/** Inner pages worth reading after the homepage, best first. */
const EXTRA_PAGE_PATTERNS: RegExp[] = [
  /about|our-story|who-we-are|company/i,
  /services|what-we-do|solutions|products|treatments|menu/i,
];

// Separate lists: a single BlockList also matches IPv4 addresses against
// IPv4-mapped IPv6 rules, so the ::ffff:0:0/96 entry would block every IPv4.
const BLOCKED_V4 = (() => {
  const list = new BlockList();
  const v4: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ];
  for (const [net, prefix] of v4) list.addSubnet(net, prefix, "ipv4");
  return list;
})();

const BLOCKED_V6 = (() => {
  const list = new BlockList();
  const v6: Array<[string, number]> = [
    ["::", 128],
    ["::1", 128],
    ["::ffff:0:0", 96], // IPv4-mapped: would bypass the v4 list
    ["64:ff9b::", 96], // NAT64
    ["100::", 64],
    ["2001:db8::", 32],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
  ];
  for (const [net, prefix] of v6) list.addSubnet(net, prefix, "ipv6");
  return list;
})();

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return BLOCKED_V4.check(address, "ipv4");
  if (family === 6) return BLOCKED_V6.check(address, "ipv6");
  return true;
}

const defaultLookup: LookupFn = async (hostname) => {
  const rows = await dnsLookup(hostname, { all: true, verbatim: true });
  return rows.map((row) => row.address);
};

/**
 * Parse the saved website value into a fetchable URL, or explain why not.
 * Accepts bare domains ("acme.com.au") because that is how most are saved.
 */
export function normaliseWebsiteUrl(raw: unknown): { ok: true; url: URL } | { ok: false; reason: string } {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return { ok: false, reason: "No website URL saved on the client" };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return { ok: false, reason: `Website URL "${value}" is not a valid URL` };
  }
  return checkUrlShape(url);
}

function checkUrlShape(url: URL): { ok: true; url: URL } | { ok: false; reason: string } {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "Only http and https website URLs can be researched" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "Website URLs with embedded credentials are not fetched" };
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    return { ok: false, reason: "Website URLs on non-standard ports are not fetched" };
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !host ||
    host === "localhost" ||
    /\.(localhost|local|internal|home|lan|corp)$/.test(host) ||
    (!host.includes(".") && isIP(host) === 0)
  ) {
    return { ok: false, reason: `Website host "${host}" is not a public domain` };
  }
  url.hash = "";
  return { ok: true, url };
}

async function assertPublicHost(url: URL, lookup: LookupFn): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : await lookup(host);
  if (addresses.length === 0) throw new Error(`${host} did not resolve`);
  if (addresses.some(isBlockedAddress)) {
    throw new Error(`${host} resolves to a non-public address`);
  }
}

async function readCappedBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(chunks.reduce((sum, c) => sum + c.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

/** Fetch one HTML page, re-validating every redirect hop. */
export async function fetchPublicHtml(
  start: URL,
  opts: { lookup?: LookupFn; signal?: AbortSignal } = {},
): Promise<{ url: URL; html: string }> {
  const lookup = opts.lookup ?? defaultLookup;
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const shape = checkUrlShape(current);
    if (!shape.ok) throw new Error(shape.reason);
    await assertPublicHost(current, lookup);

    const timeout = AbortSignal.timeout(PAGE_TIMEOUT_MS);
    const response = await fetch(current.toString(), {
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      signal: opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout,
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new Error(`Redirect from ${current.toString()} had no location`);
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`${current.toString()} returned HTTP ${response.status}`);
    }
    const type = response.headers.get("content-type") ?? "";
    if (type && !/html/i.test(type)) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`${current.toString()} is not an HTML page (${type})`);
    }
    return { url: current, html: await readCappedBody(response) };
  }
  throw new Error(`Too many redirects starting from ${start.toString()}`);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

function metaContent(html: string, key: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = /\b(?:name|property)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (name?.toLowerCase() !== key) continue;
    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (content) return decodeEntities(content).replace(/\s+/g, " ").trim();
  }
  return "";
}

/** Title, meta description and readable body text from raw HTML. */
export function extractPageContent(html: string, url: string): ResearchedPage {
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const description = metaContent(html, "description") || metaContent(html, "og:description");

  const bodyStart = html.search(/<body\b/i);
  const body = (bodyStart >= 0 ? html.slice(bodyStart) : html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|canvas)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article|\/tr|\/header|\/footer)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of decodeEntities(body).split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (line.length < 2 || seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return { url, title, description, text: lines.join("\n").slice(0, MAX_PAGE_TEXT_CHARS) };
}

function bareHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/** Same-site "about" / "services" style links, best match first. */
export function pickExtraPageUrls(html: string, base: URL, limit = MAX_EXTRA_PAGES): URL[] {
  const ranked: Array<{ url: URL; rank: number; order: number }> = [];
  const seenPaths = new Set<string>([base.pathname.replace(/\/+$/, "") || "/"]);
  const hrefs = html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"'#]+)["']/gi);
  let order = 0;
  for (const match of hrefs) {
    const href = match[1];
    if (!href) continue;
    let url: URL;
    try {
      url = new URL(decodeEntities(href), base);
    } catch {
      continue;
    }
    if (bareHost(url.hostname) !== bareHost(base.hostname)) continue;
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (seenPaths.has(path) || /\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?)$/i.test(path)) continue;
    const rank = EXTRA_PAGE_PATTERNS.findIndex((re) => re.test(path));
    if (rank < 0) continue;
    seenPaths.add(path);
    url.hash = "";
    url.search = "";
    ranked.push({ url, rank, order: order++ });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.order - b.order);
  // One page per pattern first (an about page AND a services page), then fill.
  const picked: URL[] = [];
  const usedRanks = new Set<number>();
  for (const row of ranked) {
    if (picked.length >= limit) break;
    if (usedRanks.has(row.rank)) continue;
    usedRanks.add(row.rank);
    picked.push(row.url);
  }
  for (const row of ranked) {
    if (picked.length >= limit) break;
    if (!picked.includes(row.url)) picked.push(row.url);
  }
  return picked;
}

/**
 * Read the homepage plus up to two same-site about/services pages. Inner page
 * failures are ignored; a homepage failure fails the research.
 */
export async function researchClientWebsite(
  rawUrl: unknown,
  opts: { lookup?: LookupFn; signal?: AbortSignal } = {},
): Promise<WebsiteResearchResult> {
  const parsed = normaliseWebsiteUrl(rawUrl);
  if (!parsed.ok) return parsed;

  let home: { url: URL; html: string };
  try {
    home = await fetchPublicHtml(parsed.url, opts);
  } catch (err) {
    return { ok: false, reason: `Could not read ${parsed.url.toString()}: ${err instanceof Error ? err.message : String(err)}` };
  }

  const pages: ResearchedPage[] = [extractPageContent(home.html, home.url.toString())];
  for (const extra of pickExtraPageUrls(home.html, home.url)) {
    try {
      const page = await fetchPublicHtml(extra, opts);
      pages.push(extractPageContent(page.html, page.url.toString()));
    } catch {
      // Inner pages are a bonus; the homepage alone is enough to draft from.
    }
  }

  const hasText = pages.some((p) => p.text.length > 80 || p.description);
  if (!hasText) {
    return { ok: false, reason: `${home.url.toString()} returned no readable text (likely a script-only or blocked page)` };
  }
  return { ok: true, siteUrl: home.url.toString(), pages };
}
