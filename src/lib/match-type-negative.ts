/**
 * Maps a match-type violation to the negative keyword that should be added when
 * an agency approves it.
 *
 * Both violation types add a PHRASE negative built from the search term. An
 * exact negative only blocks one literal query, so Google's close-variant
 * expansion keeps re-serving the same waste under slightly different surface
 * forms; a phrase negative blocks the offending term and all of its supersets,
 * catching the whole drift family in one rule.
 *
 *   - exact_close_variant → the exact keyword drifted to a query with an extra
 *     or substituted content word. A phrase negative on that search term blocks
 *     it and its variants without touching the original exact keyword.
 *
 *   - phrase_missing_word → the phrase keyword leaked a family of queries; a
 *     phrase negative on the search term blocks the term and its supersets.
 *
 * Safety: a phrase negative can swallow the triggering keyword when the keyword
 * itself appears as a contiguous run inside the search term (e.g. a removed
 * word). `wouldNegateKeyword` detects that and the build falls back to an exact
 * negative so the keyword keeps serving.
 */

export type ViolationType = "exact_close_variant" | "phrase_missing_word";
export type NegativeMatchType = "exact" | "phrase";

export interface MatchTypeNegative {
  keyword: string;
  matchType: NegativeMatchType;
  /** Human-readable explanation of why this negative/match type was chosen. */
  note: string;
}

function normalize(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter(Boolean);
}

/**
 * True when adding `keyword` as a `matchType` negative would also block
 * `triggeringKeyword` (i.e. the negative is broad enough to suppress the very
 * keyword it was meant to protect). Used as a safety guard before adding a
 * phrase negative.
 *
 *   - exact negative blocks the keyword only if they are identical.
 *   - phrase negative blocks a query when the negative text appears as a
 *     contiguous run inside that query, so it suppresses the keyword's own
 *     query only when the negative is a contiguous run inside the keyword.
 *     (A search term that *adds* words to the keyword — the common close-variant
 *     drift — is therefore safe: a phrase negative on it cannot match the
 *     shorter keyword query.)
 */
export function wouldNegateKeyword(
  keyword: string,
  matchType: NegativeMatchType,
  triggeringKeyword: string,
): boolean {
  const negNorm = normalize(keyword);
  const kwNorm = normalize(triggeringKeyword);
  if (!negNorm || !kwNorm) return false;

  if (matchType === "exact") {
    return negNorm === kwNorm;
  }

  // phrase: does the negative appear as a contiguous token run inside the
  // keyword? If so, the phrase negative would block the keyword's own query.
  const negTokens = tokens(negNorm);
  const kwTokens = tokens(kwNorm);
  if (negTokens.length === 0 || negTokens.length > kwTokens.length) return false;
  for (let i = 0; i + negTokens.length <= kwTokens.length; i++) {
    let match = true;
    for (let j = 0; j < negTokens.length; j++) {
      if (kwTokens[i + j] !== negTokens[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

/**
 * Decides the negative keyword + match type to add for a given violation.
 * Returns the surgical exact negative for exact violations and the broader
 * phrase negative for phrase violations, downgrading to exact if the phrase
 * negative would unsafely swallow the triggering keyword.
 */
export function buildNegativeFromViolation(violation: {
  searchTerm: string;
  triggeringKeyword: string;
  violationType: ViolationType;
  /** Detector-recommended negative text (account-coverage model). */
  recommendedKeyword?: string | null;
  /** Detector-recommended negative match type. */
  recommendedMatchType?: NegativeMatchType | null;
  /** Owned exact keyword the term drifted from, protected from phrase swallow. */
  nearestKeyword?: string | null;
}): MatchTypeNegative {
  // Honour a stored detector recommendation when present. A recommended phrase
  // negative still runs the safety guard: if it would also block the triggering
  // or nearest owned exact keyword, it downgrades to a surgical exact negative.
  const recommended = normalize(violation.recommendedKeyword ?? "");
  const recMatch = violation.recommendedMatchType;
  if (recommended && (recMatch === "exact" || recMatch === "phrase")) {
    if (recMatch === "exact") {
      return {
        keyword: recommended,
        matchType: "exact",
        note: "Recommended exact negative on the leaked search term.",
      };
    }
    const protect = [violation.triggeringKeyword, violation.nearestKeyword]
      .filter((k): k is string => Boolean(k));
    const swallowsOwned = protect.some((kw) =>
      wouldNegateKeyword(recommended, "phrase", kw),
    );
    if (swallowsOwned) {
      return {
        keyword: recommended,
        matchType: "exact",
        note: "Recommended phrase negative downgraded to exact to avoid blocking an owned keyword.",
      };
    }
    return {
      keyword: recommended,
      matchType: "phrase",
      note: "Recommended phrase negative blocks the offending word and its family.",
    };
  }

  const keyword = normalize(violation.searchTerm);

  // Both violation types prefer a phrase negative so close-variant drift is
  // blocked at the family level rather than one literal query at a time.
  if (!wouldNegateKeyword(keyword, "phrase", violation.triggeringKeyword)) {
    return {
      keyword,
      matchType: "phrase",
      note: "Phrase negative blocks this search term and its close-variant supersets.",
    };
  }

  // Defensive fallback: a phrase negative here would also block the triggering
  // keyword, so add a surgical exact negative instead.
  return {
    keyword,
    matchType: "exact",
    note: "Downgraded to an exact negative to avoid blocking the triggering keyword.",
  };
}
