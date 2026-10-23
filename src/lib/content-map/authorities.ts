import type { TopicAuthorityInput } from "./types";

/** Group keys GT reserves for its own topics; an authority key may never use them. */
export const RESERVED_TOPIC_KEYS: readonly string[] = ["core", "service", "proof", "offtopic", "other"];
export const MAX_TOPIC_AUTHORITIES = 8;

export interface AuthorityRow {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  primary?: boolean | null;
  key?: string | null;
}

export function slugifyAuthority(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "topic";
}

/**
 * Give every row a stable unique key (slug of its name; reserved or clashing
 * keys get `-topic`, then a number) and make the first row primary when none is.
 * Pure: returns new rows, never mutates.
 */
export function normalizeAuthorityRows<T extends AuthorityRow>(rows: readonly T[]): T[] {
  const used = new Set<string>();
  const out = rows.map((row) => {
    let key = slugifyAuthority(String(row.name ?? ""));
    if (RESERVED_TOPIC_KEYS.includes(key) || used.has(key)) key = `${key}-topic`;
    let n = 2;
    const base = key;
    while (RESERVED_TOPIC_KEYS.includes(key) || used.has(key)) key = `${base}-${n++}`;
    used.add(key);
    return { ...row, key, primary: row.primary === true };
  });
  const first = out[0];
  if (first && !out.some((row) => row.primary)) out[0] = { ...first, primary: true };
  return out;
}

export type AuthorityValidation = { ok: true } | { ok: false; error: string };

export function validateContentMapSettings(input: {
  enabled: boolean;
  websiteUrl: string;
  rows: readonly AuthorityRow[];
}): AuthorityValidation {
  const primaries = input.rows.filter((row) => row.primary === true).length;
  if (primaries > 1) {
    return { ok: false, error: "Only one topic authority can be primary. Untick the extra primary rows." };
  }
  if (input.rows.length > MAX_TOPIC_AUTHORITIES) {
    return { ok: false, error: `Add at most ${MAX_TOPIC_AUTHORITIES} topic authorities.` };
  }
  if (input.enabled && !input.websiteUrl.trim()) {
    return { ok: false, error: "Content analysis needs a Website URL. Add one on the client before switching it on." };
  }
  if (input.enabled && input.rows.length === 0) {
    return { ok: false, error: "Content analysis needs at least one topic authority. Add one under Content Map." };
  }
  return { ok: true };
}

/** Client doc → the authorities list GT expects (primary first, then CMS order). */
export function authoritiesFromClient(client: { topicAuthorities?: unknown }): TopicAuthorityInput[] {
  const rows = Array.isArray(client.topicAuthorities) ? (client.topicAuthorities as AuthorityRow[]) : [];
  const normalized = normalizeAuthorityRows(rows.filter((row) => String(row?.name ?? "").trim()));
  const list = normalized.map((row) => ({
    key: String(row.key),
    name: String(row.name ?? "").trim(),
    ...(row.description?.trim() ? { description: row.description.trim() } : {}),
    primary: row.primary === true,
  }));
  return [...list.filter((a) => a.primary), ...list.filter((a) => !a.primary)];
}

/** Stable comparison used by the Clients afterChange hook. */
export function authoritiesSignature(client: { topicAuthorities?: unknown } | null | undefined): string {
  if (!client) return "";
  return JSON.stringify(authoritiesFromClient(client));
}
