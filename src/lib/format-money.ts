/**
 * Shared AUD formatting for the whole-dollar style used across Google Ads
 * emails, dashboards and decks (`$1,234`, no cents).
 *
 * Other styles in the codebase (cents always shown, multi-currency with
 * locale maps, bare `$` + toFixed) are intentionally NOT routed through
 * here: they produce different strings and callers depend on that output.
 */

const AUD_WHOLE = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

/** `1234.5` → `"$1,235"`. */
export function formatAudWhole(value: number): string {
  return AUD_WHOLE.format(value);
}

/** Like {@link formatAudWhole}, but `null`/`undefined` → `"—"`. */
export function formatAudWholeOrDash(value: number | null | undefined): string {
  return value == null ? "—" : AUD_WHOLE.format(value);
}
