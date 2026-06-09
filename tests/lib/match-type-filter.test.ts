import { describe, expect, it } from "vitest";
import {
  filterViolations,
  isMonitored,
  readScope,
  type FilterableViolation,
  type MatchTypeMonitorScope,
} from "@/lib/match-type-filter";

const exactV: FilterableViolation = {
  matchType: "EXACT",
  campaignName: "Brand - Search",
  adGroupName: "Brand Core",
};
const phraseV: FilterableViolation = {
  matchType: "PHRASE",
  campaignName: "Generic - Search",
  adGroupName: "Generic Terms",
};

function scope(partial: Partial<MatchTypeMonitorScope> = {}): MatchTypeMonitorScope {
  return { exact: true, phrase: true, allowList: [], ...partial };
}

describe("isMonitored — match-type gate", () => {
  it("exact-only keeps EXACT, drops PHRASE", () => {
    const s = scope({ exact: true, phrase: false });
    expect(isMonitored(exactV, s)).toBe(true);
    expect(isMonitored(phraseV, s)).toBe(false);
  });

  it("phrase-only keeps PHRASE, drops EXACT", () => {
    const s = scope({ exact: false, phrase: true });
    expect(isMonitored(exactV, s)).toBe(false);
    expect(isMonitored(phraseV, s)).toBe(true);
  });

  it("both on keeps both", () => {
    const s = scope();
    expect(isMonitored(exactV, s)).toBe(true);
    expect(isMonitored(phraseV, s)).toBe(true);
  });

  it("neither keeps none", () => {
    const s = scope({ exact: false, phrase: false });
    expect(isMonitored(exactV, s)).toBe(false);
    expect(isMonitored(phraseV, s)).toBe(false);
  });
});

describe("isMonitored — allow-list gate", () => {
  it("empty list keeps everything", () => {
    expect(filterViolations([exactV, phraseV], scope())).toHaveLength(2);
  });

  it("campaign-scope pattern keeps only matching campaign", () => {
    const s = scope({ allowList: [{ scope: "campaign", pattern: "Brand" }] });
    expect(isMonitored(exactV, s)).toBe(true);
    expect(isMonitored(phraseV, s)).toBe(false);
  });

  it("ad_group-scope pattern keeps only matching ad group", () => {
    const s = scope({ allowList: [{ scope: "ad_group", pattern: "Generic Terms" }] });
    expect(isMonitored(exactV, s)).toBe(false);
    expect(isMonitored(phraseV, s)).toBe(true);
  });

  it("drops violations when no entry matches", () => {
    const s = scope({ allowList: [{ scope: "campaign", pattern: "Competitor" }] });
    expect(filterViolations([exactV, phraseV], s)).toHaveLength(0);
  });

  it("matches if any entry matches (multiple entries)", () => {
    const s = scope({
      allowList: [
        { scope: "campaign", pattern: "Brand" },
        { scope: "ad_group", pattern: "Generic Terms" },
      ],
    });
    expect(filterViolations([exactV, phraseV], s)).toHaveLength(2);
  });
});

describe("isMonitored — combined gates", () => {
  it("requires both match-type and allow-list to pass", () => {
    const s = scope({ exact: false, phrase: true, allowList: [{ scope: "campaign", pattern: "Generic" }] });
    expect(isMonitored(exactV, s)).toBe(false); // wrong match type
    expect(isMonitored(phraseV, s)).toBe(true); // phrase + allow-list match
    expect(
      isMonitored({ matchType: "PHRASE", campaignName: "Brand - Search" }, s),
    ).toBe(false); // phrase but campaign not allow-listed
  });
});

describe("readScope — null safety", () => {
  it("defaults to both match types on and empty allow-list", () => {
    expect(readScope(null)).toEqual({ exact: true, phrase: true, allowList: [] });
    expect(readScope({})).toEqual({ exact: true, phrase: true, allowList: [] });
    expect(readScope({ gadsAuto: {} })).toEqual({ exact: true, phrase: true, allowList: [] });
  });

  it("reads explicit false toggles", () => {
    const s = readScope({ gadsAuto: { matchTypeMonitorExact: false, matchTypeMonitorPhrase: true } });
    expect(s.exact).toBe(false);
    expect(s.phrase).toBe(true);
  });

  it("ignores blank patterns and invalid scopes", () => {
    const s = readScope({
      gadsAuto: {
        matchTypeMonitorAllowList: [
          { scope: "campaign", pattern: "  " },
          { scope: "bogus", pattern: "x" },
          { scope: "ad_group", pattern: "Keep" },
        ],
      },
    });
    expect(s.allowList).toEqual([{ scope: "ad_group", pattern: "Keep" }]);
  });
});
