/**
 * Routing for the "add as exact keyword" action.
 *
 * The weekly triage can name a better-fitting ad group than the one that
 * triggered the violation. When it does, the keyword must be created THERE, and
 * the original ad group must still receive an exact negative — otherwise both
 * groups would be eligible for the same term (double serving).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  process.env.GROWTH_TOOLS_URL = "https://gt.test";
  process.env.INTERNAL_API_KEY = "internal-key";
});

const mockPayload = {
  auth: vi.fn(),
  findByID: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  find: vi.fn(),
  logger: { error: vi.fn() },
};

vi.mock("payload", () => ({ getPayload: vi.fn(() => Promise.resolve(mockPayload)) }));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("@/lib/activity-log", () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));

const negateExactInOwnList = vi.fn();
vi.mock("@/lib/match-type-exact-negate", () => ({
  negateExactInOwnList: (...a: unknown[]) => negateExactInOwnList(...a),
}));

import { POST } from "@/app/(frontend)/api/match-type-violations/add-exact-bulk/route";

// "Vietnam developer/IT" and "Generic Vietnam outsourcing" both exist in the AU
// and US exact campaigns, so geo has to be preserved on a reroute.
const AD_GROUPS = [
  { adGroupId: "1", adGroupName: "Generic Vietnam outsourcing", campaignName: "Search - Generic - Vietnam - AU - Exact (Manual CPC)", status: "ENABLED" },
  { adGroupId: "2", adGroupName: "Vietnam developer/IT", campaignName: "Search - Generic - Vietnam - AU - Exact (Manual CPC)", status: "ENABLED" },
  { adGroupId: "3", adGroupName: "Vietnam developer/IT", campaignName: "Search - Generic - Vietnam - US - Exact (Manual CPC)", status: "ENABLED" },
  { adGroupId: "4", adGroupName: "bpo", campaignName: "Search - Generic - Outsourcing - AU - Exact (Manual CPC)", status: "ENABLED" },
  // "Admin" only exists in its own campaign family, so the source campaign name
  // cannot be rewritten into it — US vs AU rests entirely on the geo guard.
  { adGroupId: "5", adGroupName: "Admin", campaignName: "Search - Generic - Category - Admin/Data Entry - US - Exact (Manual CPC)", status: "ENABLED" },
  { adGroupId: "6", adGroupName: "Admin", campaignName: "Search - Generic - Category - Admin/Data Entry - AU - Exact (Manual CPC)", status: "ENABLED" },
];

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    status: "pending",
    searchTerm: "custom software development vietnam",
    campaignName: "Search - Generic - Vietnam - AU - Phrase (Manual CPC)",
    adGroupName: "Generic Vietnam outsourcing",
    client: { id: 6, googleAdsCustomerId: "123-456-7890" },
    addedAsKeywordAt: null,
    ...overrides,
  };
}

let addCalls: Array<{ adGroupId: string; body: any }> = [];

function mockFetch() {
  return vi.fn((url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (String(url).includes("/ad-groups/list")) {
      return Promise.resolve({ ok: true, json: async () => ({ adGroups: AD_GROUPS }) } as Response);
    }
    const match = String(url).match(/ad-groups\/([^/]+)\/keywords\/add/);
    if (match) {
      addCalls.push({ adGroupId: decodeURIComponent(match[1]), body });
      return Promise.resolve({
        ok: true,
        json: async () => ({ added: 1, skippedDuplicates: 0, duplicates: [], errors: [] }),
      } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response);
  });
}

function request(candidateIds: Array<string | number>) {
  return new NextRequest("https://cms.test/api/match-type-violations/add-exact-bulk", {
    method: "POST",
    body: JSON.stringify({ candidateIds, autoExactFromCandidates: true, negateSource: true }),
  });
}

beforeEach(() => {
  addCalls = [];
  mockPayload.auth.mockReset().mockResolvedValue({ user: { id: 1 } });
  mockPayload.update.mockReset().mockResolvedValue({});
  mockPayload.find.mockReset().mockResolvedValue({ docs: [] });
  negateExactInOwnList.mockReset().mockResolvedValue({ alreadyPresent: false });
  vi.stubGlobal("fetch", mockFetch());
});

describe("add-exact-bulk ad group routing", () => {
  it("adds the keyword to the AI's suggested ad group, not the triggering one", async () => {
    mockPayload.findByID.mockResolvedValue(candidate({ aiSuggestedAdGroup: "Vietnam developer/IT" }));

    const res = await POST(request([7]));
    expect(res.status).toBe(200);

    // Ad group 2 = Vietnam developer/IT in the AU campaign.
    expect(addCalls.map((c) => c.adGroupId)).toEqual(["2"]);
  });

  it("still negates the term in the original ad group so both cannot serve it", async () => {
    mockPayload.findByID.mockResolvedValue(candidate({ aiSuggestedAdGroup: "Vietnam developer/IT" }));

    await POST(request([7]));

    expect(negateExactInOwnList).toHaveBeenCalledTimes(1);
    const [, negatedCandidate, keywordText] = negateExactInOwnList.mock.calls[0];
    // Negated against the SOURCE candidate, i.e. its own ad group's list.
    expect(negatedCandidate.adGroupName).toBe("Generic Vietnam outsourcing");
    expect(keywordText).toBe("custom software development vietnam");
  });

  it("keeps a rerouted keyword in the source campaign's country", async () => {
    mockPayload.findByID.mockResolvedValue(
      candidate({
        aiSuggestedAdGroup: "Vietnam developer/IT",
        campaignName: "Search - Generic - Vietnam - US - Phrase (Manual CPC)",
      }),
    );

    await POST(request([7]));

    // Ad group 3 = the US copy, not the AU one.
    expect(addCalls.map((c) => c.adGroupId)).toEqual(["3"]);
  });

  it("falls back to the triggering ad group when there is no suggestion", async () => {
    mockPayload.findByID.mockResolvedValue(candidate({ aiSuggestedAdGroup: null }));

    await POST(request([7]));

    expect(addCalls.map((c) => c.adGroupId)).toEqual(["1"]);
    // Same ad group name, but the keyword lands in the Exact campaign while the
    // candidate came from the Phrase one, so the phrase side is still negated.
    expect(negateExactInOwnList).toHaveBeenCalledTimes(1);
  });

  it("keeps a cross-campaign reroute in the source country", async () => {
    mockPayload.findByID.mockResolvedValue(
      candidate({
        searchTerm: "offshore administrative support",
        adGroupName: "bpo",
        campaignName: "Search - Generic - Outsourcing - AU - Phrase (Manual CPC)",
        aiSuggestedAdGroup: "Admin",
      }),
    );

    await POST(request([7]));

    // Ad group 6 = the AU Admin group. Ad group 5 (US) would be a geo mistake,
    // and it is listed first, so picking it is the natural failure mode.
    expect(addCalls.map((c) => c.adGroupId)).toEqual(["6"]);
  });

  it("ignores a suggested ad group that does not exist in the account", async () => {
    mockPayload.findByID.mockResolvedValue(candidate({ aiSuggestedAdGroup: "No Such Group" }));

    await POST(request([7]));

    expect(addCalls).toEqual([]);
    expect(negateExactInOwnList).not.toHaveBeenCalled();
  });
});
