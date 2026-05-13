/**
 * Deck-wide text sanitisation helpers.
 *
 * The v2 proposal deck has a hard rule: no en or em dashes anywhere in the
 * rendered output. Hardcoded strings in the slide components are easy to
 * police; the harder cases are user-edited proposal fields (mission priority
 * descriptions, roadmap bodies, commercial-card features, etc.) where a team
 * member can paste copy that smart-quotes/dashes have crept into.
 *
 * `stripDashes` runs at render time on every string that flows from the CMS
 * into a slide. It is intentionally lossy (we replace dashes with the closest
 * sensible punctuation) so the deck stays consistent regardless of input.
 *
 * Rules:
 *   - " — " / " – " (em or en dash with surrounding whitespace) → ". " when
 *     it sits between sentences; the trailing dot is preserved if already
 *     present (no "..").
 *   - Any remaining bare em / en dash becomes a hyphen "-".
 *   - Whitespace is collapsed.
 *   - Empty / nullish input returns "".
 */
export function stripDashes(value: string | null | undefined): string {
  if (!value) return ''
  let s = value
  // " — ", " – ", " — ", "— ", " —" — collapse to ". " so the clause break
  // still reads naturally. Captures any combination of leading / trailing
  // whitespace, including non-breaking spaces.
  s = s.replace(/[\s\u00a0]*[\u2014\u2013][\s\u00a0]*/g, '. ')
  // Bare dashes that survived (none should, but defence in depth) → "-".
  s = s.replace(/[\u2014\u2013]/g, '-')
  // Collapse doubled periods and runs of whitespace.
  s = s.replace(/\.\s*\.\s*/g, '. ').replace(/\s{2,}/g, ' ').trim()
  return s
}
