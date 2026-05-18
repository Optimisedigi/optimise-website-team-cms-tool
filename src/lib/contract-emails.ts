/**
 * Helpers for the `clientEmail` field on contracts.
 *
 * The field is stored as a single string but accepts a comma-separated list:
 *   "primary@example.com, cc1@example.com, cc2@example.com"
 *
 * The first address is the canonical signer (shown on PDF / DOCX / signed
 * record). Any additional addresses are CC'd on the signing invite and the
 * signed receipt.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParsedClientEmails = {
  /** First email — the canonical signer. `null` if none parsed. */
  primary: string | null;
  /** Remaining emails after the first. */
  ccs: string[];
  /** All emails (primary + ccs) for convenience. */
  all: string[];
};

/**
 * Split a raw `clientEmail` value into primary + ccs.
 * Trims whitespace, drops blanks, dedupes (case-insensitive), preserves order.
 * Does NOT validate — use {@link validateClientEmails} for that.
 */
export function parseClientEmails(raw: string | null | undefined): ParsedClientEmails {
  if (!raw || typeof raw !== "string") {
    return { primary: null, ccs: [], all: [] };
  }
  const seen = new Set<string>();
  const all: string[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(trimmed);
  }
  return {
    primary: all[0] ?? null,
    ccs: all.slice(1),
    all,
  };
}

/**
 * Validate a comma-separated email list. Returns `true` when every entry is a
 * syntactically valid email address (or when the input is empty — the field
 * itself is optional). Returns an error string suitable for Payload's
 * `validate` hook when invalid.
 */
export function validateClientEmails(raw: unknown): true | string {
  if (raw === null || raw === undefined || raw === "") return true;
  if (typeof raw !== "string") return "Must be a string of comma-separated emails.";
  const { all } = parseClientEmails(raw);
  if (all.length === 0) return true;
  const invalid = all.filter((e) => !EMAIL_RE.test(e));
  if (invalid.length > 0) {
    return `Invalid email${invalid.length > 1 ? "s" : ""}: ${invalid.join(", ")}`;
  }
  return true;
}

/**
 * Returns the canonical signer email (first of the comma-separated list).
 * Convenience wrapper used by PDF/DOCX rendering and the sign page.
 */
export function getPrimaryClientEmail(raw: string | null | undefined): string {
  return parseClientEmails(raw).primary ?? "";
}
