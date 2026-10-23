/**
 * Standalone Content Map page: cms.optimisedigital.online/SEO/Topic-association-linking/<client-slug>.
 * The client segment is the client's URL slug (Clients → slug); names are accepted and redirected to it.
 */

import type { Payload, TypedUser } from "payload";

export const CONTENT_MAP_BASE_PATH = "/SEO/Topic-association-linking";

export function contentMapPath(slug: string): string {
  return `${CONTENT_MAP_BASE_PATH}/${encodeURIComponent(slug)}`;
}

export function slugifyClientName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export interface ResolvedClient {
  id: string;
  name: string;
  slug: string;
  /** The URL used something other than the exact slug: redirect to contentMapPath(slug). */
  redirect: boolean;
}

type ClientRow = { id: unknown; name?: unknown; tradingName?: unknown; slug?: unknown };

/**
 * Find the client for a URL segment, with the signed-in user's access applied.
 * Exact slug first, then case-insensitive slug, then the client's name or
 * trading name written as a slug (e.g. "Away-Digital-Teams").
 */
export async function resolveClientParam(payload: Payload, param: string, user: TypedUser): Promise<ResolvedClient | null> {
  const raw = safeDecode(param).trim();
  if (!raw || raw.length > 200) return null;
  const select = { name: true, tradingName: true, slug: true } as const;
  const bySlug = async (slug: string) =>
    (
      await payload.find({ collection: "clients", where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: false, user, select })
    ).docs[0] as unknown as ClientRow | undefined;

  let row = await bySlug(raw);
  if (!row && raw.toLowerCase() !== raw) row = await bySlug(raw.toLowerCase());
  if (!row) {
    const wanted = slugifyClientName(raw);
    if (wanted) {
      const all = await payload.find({ collection: "clients", limit: 2000, depth: 0, overrideAccess: false, user, select, pagination: false });
      const rows = all.docs as unknown as ClientRow[];
      row =
        rows.find((c) => typeof c.slug === "string" && slugifyClientName(c.slug) === wanted) ??
        rows.find((c) => typeof c.name === "string" && slugifyClientName(c.name) === wanted) ??
        rows.find((c) => typeof c.tradingName === "string" && slugifyClientName(c.tradingName) === wanted);
    }
  }
  if (!row || typeof row.slug !== "string" || !row.slug) return null;
  return { id: String(row.id), name: String(row.name ?? row.slug), slug: row.slug, redirect: raw !== row.slug };
}

/** Client slugs as used in report URLs (same shape as the other PIN-gated reports). */
export function validReportSlug(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
}

/**
 * Client behind a client-facing report URL, before any sign-in: exact slug
 * (or its lower-case form) only, active, with a PIN to unlock it and Content
 * Map switched on. No name matching here, so visitors can't search clients.
 */
export async function findReportClient(payload: Payload, param: string): Promise<{ id: string; name: string; slug: string } | null> {
  const raw = safeDecode(param).trim();
  if (!validReportSlug(raw)) return null;
  const candidates = raw === raw.toLowerCase() ? [raw] : [raw, raw.toLowerCase()];
  for (const slug of candidates) {
    const res = await payload.find({
      collection: "clients",
      where: {
        and: [
          { slug: { equals: slug } },
          { isActive: { equals: true } },
          { clientPin: { exists: true } },
          { contentMapEnabled: { equals: true } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      select: { name: true, slug: true },
    });
    const row = res.docs[0] as unknown as { id: unknown; name?: unknown; slug?: unknown } | undefined;
    if (row && typeof row.slug === "string") return { id: String(row.id), name: String(row.name ?? row.slug), slug: row.slug };
  }
  return null;
}

/**
 * The client's Website URL as a full address. The CMS field is free text, so
 * "www.example.com" or "example.com/" are common; Growth Tools needs
 * "https://www.example.com". Returns "" when it can't be a public web address.
 */
export function normaliseSiteUrl(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text.replace(/^\/+/, "")}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    if (!u.hostname.includes(".")) return "";
    u.hash = "";
    u.search = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

/** `normaliseSiteUrl` for a client record. */
export function clientSiteUrl(client: { websiteUrl?: unknown } | Record<string, unknown> | null | undefined): string {
  return normaliseSiteUrl((client as { websiteUrl?: unknown } | null | undefined)?.websiteUrl);
}
