import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("CMS search-target boundary contracts", () => {
  it.each([
    [
      "proposal audit fan-out",
      "src/app/(frontend)/api/proposals/[id]/run-audits/route.ts",
      ["searchLanguage", "language: searchLanguage || undefined"],
    ],
    [
      "content-question refresh",
      "src/app/(frontend)/api/proposals/[id]/refresh-content-questions/route.ts",
      ["proposal.searchLanguage", "JSON.stringify({ keyword, location, language })"],
    ],
    [
      "manual competitor SERP metrics",
      "src/app/(frontend)/api/proposals/[id]/run-manual-competitor-serp-metrics/route.ts",
      ["proposal.searchLanguage", "language: searchLanguage || undefined"],
    ],
    [
      "proposal SERP displacement",
      "src/app/(frontend)/api/proposals/[id]/run-serp-displacement/route.ts",
      ["proposal?.searchLanguage", "language,", "\"x-internal-key\": INTERNAL_API_KEY"],
    ],
    [
      "proposal keyword research",
      "src/app/(frontend)/api/client-proposals/keyword-research/route.ts",
      ["body?.language", "language: input.language"],
    ],
    [
      "SEO proposal run",
      "src/app/(frontend)/api/seo-audit-proposals/[id]/run/route.ts",
      ["record.searchLanguage", "engineBody.language = searchLanguage"],
    ],
  ])("forwards location and language at the %s boundary", (_name, path, assertions) => {
    const text = source(path);
    expect(text).toContain("location");
    for (const assertion of assertions) expect(text).toContain(assertion);
  });

  it("snapshots an explicit SEO proposal language before asynchronous execution", () => {
    const text = source("src/app/(frontend)/api/seo-audit-proposals/create-and-run/route.ts");
    expect(text).toContain("searchLanguage = p.searchLanguage || undefined");
    expect(text).toContain("searchLanguage: searchLanguage || null");
  });

  it("snapshots and forwards campaign-proposal search targeting", () => {
    const text = source("src/app/(frontend)/api/google-ads-audits/[id]/run-campaign-proposal/route.ts");
    expect(text).toContain("proposalTargetLocation: searchLocation");
    expect(text).toContain("proposalSearchLanguage: searchLanguage || null");
    expect(text).toContain("location: searchLocation");
    expect(text).toContain("language: searchLanguage");
  });

  it("reads both persisted admin fields when keyword research starts", () => {
    const text = source("src/components/KeywordResearchAutofill.tsx");
    expect(text).toContain("getFieldValue(fields, 'targetLocation')");
    expect(text).toContain("getFieldValue(fields, 'searchLanguage')");
    expect(text).toContain("language: searchLanguage");
  });
});
