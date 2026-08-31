import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  process.env.CRON_SECRET = "triage-secret";
});

const mockPayload = {
  find: vi.fn(),
  update: vi.fn(),
  logger: { error: vi.fn() },
};

vi.mock("payload", () => ({ getPayload: vi.fn(() => Promise.resolve(mockPayload)) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("@/lib/activity-log", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));

const researchSearchTerms = vi.fn();
const classifyViolations = vi.fn();
vi.mock("@/lib/search-term-research", () => ({
  researchSearchTerms: (...a: unknown[]) => researchSearchTerms(...a),
  NO_SUMMARY:
    "No summary available \u2014 the AI summariser is unavailable or returned nothing for this term.",
}));
vi.mock("@/lib/match-type-triage", () => ({
  classifyViolations: (...a: unknown[]) => classifyViolations(...a),
}));

import { GET } from "@/app/(frontend)/api/match-type-violations/triage/cron/route";

function request(path = "/api/match-type-violations/triage/cron"): NextRequest {
  return new NextRequest(`https://cms.example${path}`, {
    headers: { authorization: "Bearer triage-secret" },
  });
}

const candidate = {
  id: 7,
  searchTerm: "offshore developers",
  campaignName: "Search - Brand",
  adGroupName: "Offshore",
  triggeringKeyword: "offshore team",
  clicks: 3,
  impressions: 40,
};

beforeEach(() => {
  mockPayload.find.mockReset();
  mockPayload.update.mockReset();
  researchSearchTerms.mockReset();
  classifyViolations.mockReset();

  mockPayload.find.mockImplementation(({ collection }: { collection: string }) =>
    Promise.resolve(
      collection === "clients"
        ? { docs: [{ id: 5, name: "Away Digital Teams", websiteUrl: "https://awaydigitalteams.com" }] }
        : { docs: [candidate] },
    ),
  );
  researchSearchTerms.mockResolvedValue({
    grounded: true,
    results: [
      {
        term: "offshore developers",
        summary: "A generic phrase for hiring remote developers.",
        grounded: true,
        source: { title: "Offshore dev guide", link: "https://example.com", snippet: "" },
      },
    ],
  });
});

describe("match-type triage cron", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await GET(new NextRequest("https://cms.example/api/match-type-violations/triage/cron"));
    expect(res.status).toBe(401);
    expect(mockPayload.find).not.toHaveBeenCalled();
  });

  it("persists a decision with its research provenance", async () => {
    classifyViolations.mockResolvedValue([
      { id: 7, decision: "relevant_keyword", reason: "Generic and relevant.", confidence: 88 },
    ]);

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.decided).toBe(1);
    expect(mockPayload.update).toHaveBeenCalledTimes(1);
    const data = mockPayload.update.mock.calls[0][0].data;
    expect(data.aiDecision).toBe("relevant_keyword");
    expect(data.aiConfidence).toBe(88);
    expect(data.aiSourceLink).toBe("https://example.com");
    expect(data.aiDecidedAt).toBeTruthy();
  });

  it("leaves rows undecided when classification fails to parse", async () => {
    classifyViolations.mockRejectedValue(new Error("No JSON array found in model reply"));

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.decided).toBe(0);
    // No write at all: aiDecidedAt stays NULL so next week's run retries.
    expect(mockPayload.update).not.toHaveBeenCalled();
    expect(body.skipped[0].reason).toMatch(/classification failed/);
  });

  it("skips the client entirely when research summarisation failed", async () => {
    researchSearchTerms.mockResolvedValue({ grounded: false, results: [], summariserError: "rate limited" });

    const res = await GET(request());
    const body = await res.json();

    expect(classifyViolations).not.toHaveBeenCalled();
    expect(mockPayload.update).not.toHaveBeenCalled();
    expect(body.skipped[0].reason).toMatch(/research failed/);
  });

  it("only selects undecided, pending, phrase-match rows with traffic", async () => {
    classifyViolations.mockResolvedValue([
      { id: 7, decision: "irrelevant", reason: "Unrelated.", confidence: 70 },
    ]);

    await GET(request());

    const candidateQuery = mockPayload.find.mock.calls
      .map((call) => call[0] as { collection: string; where: any; limit: number })
      .find((args) => args.collection === "match-type-violation-candidates")!;
    expect(candidateQuery.where.and).toEqual(
      expect.arrayContaining([
        { status: { equals: "pending" } },
        { matchType: { equals: "PHRASE" } },
        { aiDecidedAt: { exists: false } },
        { or: [{ clicks: { greater_than: 0 } }, { impressions: { greater_than: 5 } }] },
      ]),
    );
    expect(candidateQuery.limit).toBe(60);
  });
});

describe("triage cron never touches Google Ads", () => {
  it("writes only ai_* fields — never status, and never a Google Ads mutation", async () => {
    classifyViolations.mockResolvedValue([
      { id: 7, decision: "competitor", reason: "Rival firm.", confidence: 90 },
    ]);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await GET(request());

    const data = mockPayload.update.mock.calls[0][0].data;
    // The candidate's approve/dismiss state is the human's alone.
    expect(data).not.toHaveProperty("status");
    expect(data).not.toHaveProperty("assignedListId");
    expect(data).not.toHaveProperty("approvedAt");
    expect(Object.keys(data).every((k) => k.startsWith("ai"))).toBe(true);
    // No outbound call from the cron itself: research/LLM are mocked, so any
    // fetch here would be a direct Google Ads / Growth Tools mutation.
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("rows without usable research", () => {
  const NO_SUMMARY =
    "No summary available — the AI summariser is unavailable or returned nothing for this term.";

  it("leaves an unresearched row undecided instead of classifying it blind", async () => {
    researchSearchTerms.mockResolvedValue({
      grounded: true,
      results: [{ term: "offshore developers", summary: NO_SUMMARY, grounded: false, source: null }],
    });

    const res = await GET(request());
    const body = await res.json();

    expect(classifyViolations).not.toHaveBeenCalled();
    expect(mockPayload.update).not.toHaveBeenCalled();
    expect(body.skipped[0].reason).toMatch(/no usable research/);
  });
});
