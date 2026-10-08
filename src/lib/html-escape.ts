/**
 * Escape a value for safe interpolation into HTML text content or a
 * double/single-quoted attribute.
 *
 * Single shared implementation — previously this helper was copy-pasted
 * into ~24 files with slightly different coverage. Always escapes all five
 * significant characters so the result is safe in both text and attribute
 * contexts.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
