import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Types re-exported from index ─────────────────────────────────────────────
import type {
  AdGroupSnapshotRow,
  CampaignSnapshotRow,
  KeywordSnapshotRow,
  SearchTermSnapshotRow,
  SnapshotLevel,
  SnapshotRecord,
} from "@/lib/google-ads-snapshots/index";

// We only import the read helpers; `types` is tested by inference here.
import {
  getLatestSnapshot,
  getCampaignSnapshot,
  getAdGroupSnapshot,
  getKeywordSnapshot,
  getSearchTermSnapshot,
  getAllLatestForClient,
} from "@/lib/google-ads-snapshots/index";

// ─── Payload mock factory ─────────────────────────────────────────────────────

function makePayloadMock(foundDocs: unknown[] = []) {
  return {
    find: vi.fn().mockResolvedValue({ docs: foundDocs }),
  } as unknown as import("payload").Payload;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function campaignDoc(id: string | number, customerId = "123") {
  const rows = [
    { campaignId: "c1", name: "Camp 1", status: "ENABLED", spend: 100, clicks: 10, impressions: 1000, conversions: 2, ctr: 1, cpa: 50 },
    { campaignId: "c2", name: "Camp 2", status: "ENABLED", spend: 200, clicks: 20, impressions: 2000, conversions: 4, ctr: 1, cpa: 50 },
  ];
  return {
    id,
    client: id,
    level: "campaign",
    capturedAt: "2026-05-20T10:00:00.000Z",
    customerId,
    rowCount: rows.length,
    rows,
  };
}

function adGroupDoc(id: string | number) {
  return {
    id,
    client: id,
    level: "ad_group",
    capturedAt: "2026-05-20T10:00:00.000Z",
    customerId: "123",
    rowCount: 5,
    rows: [
      { adGroupId: "ag1", campaignId: "c1", name: "AG 1", status: "ENABLED", spend: 50, clicks: 5, impressions: 500, conversions: 1 },
    ],
  };
}

function keywordDoc(id: string | number) {
  return {
    id,
    client: id,
    level: "keyword",
    capturedAt: "2026-05-20T10:00:00.000Z",
    customerId: "123",
    rowCount: 10,
    rows: [
      { keywordId: "k1", text: "shoes", matchType: "EXACT", spend: 25, clicks: 3, impressions: 100, conversions: 0 },
    ],
  };
}

function searchTermDoc(id: string | number) {
  return {
    id,
    client: id,
    level: "search_term",
    capturedAt: "2026-05-20T10:00:00.000Z",
    customerId: "123",
    rowCount: 20,
    rows: [
      { term: "running shoes", impressions: 200, clicks: 10, spend: 50, conversions: 2, cpa: 25 },
    ],
  };
}

// ─── getLatestSnapshot ─────────────────────────────────────────────────────────

describe("getLatestSnapshot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T12:00:00.000Z"));
  });

  it("returns null when no document exists for (client, level)", async () => {
    const payload = makePayloadMock([]);
    const result = await getLatestSnapshot(payload, { clientId: 99, level: "campaign" });
    expect(result).toBeNull();
  });

  it("returns the document shaped as SnapshotRecord when found", async () => {
    const payload = makePayloadMock([campaignDoc(5, "456")]);
    const result = await getLatestSnapshot(payload, { clientId: 5, level: "campaign" });
    expect(result).not.toBeNull();
    expect(result!.level).toBe("campaign");
    expect(result!.clientId).toBe("5");
    expect(result!.customerId).toBe("456");
    expect(result!.rowCount).toBe(2);
    expect(Array.isArray(result!.rows)).toBe(true);
  });

  it("sets isStale=false for a fresh snapshot", async () => {
    vi.setSystemTime(new Date("2026-05-20T10:30:00.000Z")); // 30 min after capture
    const payload = makePayloadMock([campaignDoc(1)]);
    const result = await getLatestSnapshot(payload, { clientId: 1, level: "campaign", staleAfterMinutes: 1440 });
    expect(result!.isStale).toBe(false);
    expect(result!.ageMinutes).toBe(30);
  });

  it("sets isStale=true when age exceeds staleAfterMinutes", async () => {
    vi.setSystemTime(new Date("2026-05-21T12:00:00.000Z")); // 26 hours after capture
    const payload = makePayloadMock([campaignDoc(1)]);
    const result = await getLatestSnapshot(payload, { clientId: 1, level: "campaign", staleAfterMinutes: 1440 });
    expect(result!.isStale).toBe(true);
    expect(result!.ageMinutes).toBe(1560); // 26 * 60
  });

  it("uses default staleAfterMinutes of 1440 when not specified", async () => {
    vi.setSystemTime(new Date("2026-05-21T12:00:00.000Z"));
    const payload = makePayloadMock([campaignDoc(1)]);
    const result = await getLatestSnapshot(payload, { clientId: 1, level: "campaign" });
    expect(result!.isStale).toBe(true);
  });

  it("passes the correct where clause to payload.find", async () => {
    const payload = makePayloadMock([]);
    await getLatestSnapshot(payload, { clientId: 7, level: "search_term" });
    expect(payload.find).toHaveBeenCalledOnce();
    const call = (payload.find as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(call.collection).toBe("google-ads-snapshots");
    expect((call.where as Record<string, unknown>)["and"]).toContainEqual({ client: { equals: 7 } });
    expect((call.where as Record<string, unknown>)["and"]).toContainEqual({ level: { equals: "search_term" } });
  });

  it("requests depth:0 and overrideAccess:true", async () => {
    const payload = makePayloadMock([]);
    await getLatestSnapshot(payload, { clientId: 1, level: "campaign" });
    const call = (payload.find as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(call.depth).toBe(0);
    expect(call.overrideAccess).toBe(true);
  });

  it("handles client as a numeric id", async () => {
    const payload = makePayloadMock([campaignDoc(42)]);
    const result = await getLatestSnapshot(payload, { clientId: 42, level: "campaign" });
    expect(result!.clientId).toBe("42");
  });

  it("handles client as a populated relationship object", async () => {
    const payload = makePayloadMock([{ ...campaignDoc(1), client: { id: 88 } }]);
    const result = await getLatestSnapshot(payload, { clientId: 1, level: "campaign" });
    expect(result!.clientId).toBe("88");
  });

  it("handles client as a string id", async () => {
    const payload = makePayloadMock([{ ...campaignDoc("str-id"), client: "str-id" }]);
    const result = await getLatestSnapshot(payload, { clientId: "str-id", level: "campaign" });
    expect(result!.clientId).toBe("str-id");
  });

  it("returns null when docs array is empty", async () => {
    const payload = makePayloadMock([]);
    const result = await getLatestSnapshot(payload, { clientId: 1, level: "campaign" });
    expect(result).toBeNull();
  });

  it("decorates record with optional fields when present", async () => {
    const payload = makePayloadMock([{
      ...campaignDoc(1),
      dateRangeLabel: "LAST_14_DAYS",
      dateRangeStart: "2026-05-06",
      dateRangeEnd: "2026-05-20",
      sourceEndpoint: "/api/google-ads/campaign-budgets/get-metrics",
      fetchDurationMs: 1234,
      error: null,
    }]);
    const result = await getLatestSnapshot(payload, { clientId: 1, level: "campaign" });
    expect(result!.dateRangeLabel).toBe("LAST_14_DAYS");
    expect(result!.dateRangeStart).toBe("2026-05-06");
    expect(result!.dateRangeEnd).toBe("2026-05-20");
    expect(result!.sourceEndpoint).toBe("/api/google-ads/campaign-budgets/get-metrics");
    expect(result!.fetchDurationMs).toBe(1234);
    expect(result!.error).toBeUndefined();
  });

  it("does not include optional fields when absent", async () => {
    const payload = makePayloadMock([campaignDoc(1)]);
    const result = await getLatestSnapshot(payload, { clientId: 1, level: "campaign" });
    expect("dateRangeLabel" in result!).toBe(false);
    expect("sourceEndpoint" in result!).toBe(false);
  });
});

// ─── Level-specific helpers ───────────────────────────────────────────────────

describe("getCampaignSnapshot", () => {
  it("delegates to getLatestSnapshot with level=campaign", async () => {
    const payload = makePayloadMock([campaignDoc(1)]);
    const result = await getCampaignSnapshot(payload, { clientId: 1 });
    expect(result!.level).toBe("campaign");
    expect(result!.rows.length).toBeGreaterThan(0);
  });
});

describe("getAdGroupSnapshot", () => {
  it("delegates to getLatestSnapshot with level=ad_group", async () => {
    const payload = makePayloadMock([adGroupDoc(2)]);
    const result = await getAdGroupSnapshot(payload, { clientId: 2 });
    expect(result!.level).toBe("ad_group");
  });
});

describe("getKeywordSnapshot", () => {
  it("delegates to getLatestSnapshot with level=keyword", async () => {
    const payload = makePayloadMock([keywordDoc(3)]);
    const result = await getKeywordSnapshot(payload, { clientId: 3 });
    expect(result!.level).toBe("keyword");
  });
});

describe("getSearchTermSnapshot", () => {
  it("delegates to getLatestSnapshot with level=search_term", async () => {
    const payload = makePayloadMock([searchTermDoc(4)]);
    const result = await getSearchTermSnapshot(payload, { clientId: 4 });
    expect(result!.level).toBe("search_term");
  });
});

// ─── getAllLatestForClient ───────────────────────────────────────────────────

describe("getAllLatestForClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T12:00:00.000Z"));
  });

  it("returns all four levels in parallel", async () => {
    // Each parallel call gets its own result via mockResolvedValueOnce chain.
    const payload = {
      find: vi.fn()
        .mockResolvedValueOnce({ docs: [campaignDoc(1)] })
        .mockResolvedValueOnce({ docs: [adGroupDoc(1)] })
        .mockResolvedValueOnce({ docs: [keywordDoc(1)] })
        .mockResolvedValueOnce({ docs: [searchTermDoc(1)] }),
    } as unknown as import("payload").Payload;

    const result = await getAllLatestForClient(payload, { clientId: 1 });
    expect(result.campaign).not.toBeNull();
    expect(result.ad_group).not.toBeNull();
    expect(result.keyword).not.toBeNull();
    expect(result.search_term).not.toBeNull();
  });

  it("returns nulls for levels with no snapshot", async () => {
    const payload = makePayloadMock([]);
    const result = await getAllLatestForClient(payload, { clientId: 99 });
    expect(result.campaign).toBeNull();
    expect(result.ad_group).toBeNull();
    expect(result.keyword).toBeNull();
    expect(result.search_term).toBeNull();
  });

  it("respects staleAfterMinutes for all four levels", async () => {
    vi.setSystemTime(new Date("2026-05-21T12:00:00.000Z"));
    const payload = makePayloadMock([campaignDoc(1), adGroupDoc(1), keywordDoc(1), searchTermDoc(1)]);
    const result = await getAllLatestForClient(payload, { clientId: 1, staleAfterMinutes: 3000 });
    // 26h > 3000min (50h) → false. Actually 1560min < 3000min → not stale
    expect(result.campaign!.isStale).toBe(false);
  });
});

// ─── Type re-exports ─────────────────────────────────────────────────────────

describe("types are re-exported from index", () => {
  it("SnapshotLevel is exported", () => {
    const levels: SnapshotLevel[] = ["campaign", "ad_group", "keyword", "search_term"];
    expect(levels).toHaveLength(4);
  });

  it("CampaignSnapshotRow is exported", () => {
    const row: CampaignSnapshotRow = {
      campaignId: "c1",
      name: "Test",
      status: "ENABLED",
      spend: 100,
      clicks: 10,
      impressions: 1000,
      conversions: 2,
      ctr: 1,
      cpa: 50,
    };
    expect(row.campaignId).toBe("c1");
  });

  it("AdGroupSnapshotRow is exported", () => {
    const row: AdGroupSnapshotRow = {
      adGroupId: "ag1",
      campaignId: "c1",
      name: "AG 1",
      status: "ENABLED",
    };
    expect(row.adGroupId).toBe("ag1");
  });

  it("KeywordSnapshotRow is exported", () => {
    const row: KeywordSnapshotRow = {
      text: "shoes",
      matchType: "EXACT",
    };
    expect(row.matchType).toBe("EXACT");
  });

  it("SearchTermSnapshotRow is exported", () => {
    const row: SearchTermSnapshotRow = {
      term: "running shoes",
      impressions: 100,
      clicks: 10,
      spend: 50,
      conversions: 1,
      cpa: 50,
    };
    expect(row.cpa).toBe(50);
  });

  it("SnapshotRecord generic works for each level", () => {
    const record: SnapshotRecord<"campaign"> = {
      level: "campaign",
      clientId: "1",
      customerId: "123",
      capturedAt: "2026-05-20T10:00:00Z",
      rowCount: 0,
      rows: [],
      isStale: false,
      ageMinutes: 0,
    };
    expect(record.level).toBe("campaign");
  });
});

// ─── Windowed readers (multi-window snapshots) ─────────────────────────────────

import {
  getKeywordSnapshotForWindow,
  getAdGroupSnapshotForWindow,
} from "@/lib/google-ads-snapshots/index";

function makeFilteringPayload(allDocs: Array<Record<string, unknown>>) {
  return {
    find: vi.fn(async (args: { where?: Record<string, unknown> }) => {
      const and = Array.isArray((args.where as { and?: unknown })?.and)
        ? ((args.where as { and: Array<Record<string, unknown>> }).and)
        : [];
      let docs = [...allDocs];
      for (const cond of and) {
        if (cond.client && typeof cond.client === "object") {
          docs = docs.filter((d) => d.client === (cond.client as { equals: unknown }).equals);
        }
        if (cond.level && typeof cond.level === "object") {
          docs = docs.filter((d) => d.level === (cond.level as { equals: unknown }).equals);
        }
        if (cond.dateRangeLabel && typeof cond.dateRangeLabel === "object") {
          docs = docs.filter((d) => d.dateRangeLabel === (cond.dateRangeLabel as { equals: unknown }).equals);
        }
      }
      return { docs };
    }),
  } as unknown as import("payload").Payload;
}

describe("windowed snapshot readers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T11:00:00.000Z"));
  });

  it("getKeywordSnapshotForWindow returns the 90d row when present", async () => {
    const payload = makeFilteringPayload([
      { ...keywordDoc(1), dateRangeLabel: "LAST_30_DAYS" },
      { ...keywordDoc(1), id: 2, dateRangeLabel: "LAST_90_DAYS" },
    ]);
    const result = await getKeywordSnapshotForWindow(payload, { clientId: 1 });
    expect(result).not.toBeNull();
    expect(result!.dateRangeLabel).toBe("LAST_90_DAYS");
  });

  it("getKeywordSnapshotForWindow returns null when the 90d window is absent", async () => {
    const payload = makeFilteringPayload([
      { ...keywordDoc(1), dateRangeLabel: "LAST_30_DAYS" },
    ]);
    const result = await getKeywordSnapshotForWindow(payload, { clientId: 1 });
    expect(result).toBeNull();
  });

  it("getAdGroupSnapshotForWindow returns the 60d row when present", async () => {
    const payload = makeFilteringPayload([
      { ...adGroupDoc(1), dateRangeLabel: "STRUCTURAL" },
      { ...adGroupDoc(1), id: 3, dateRangeLabel: "LAST_60_DAYS" },
    ]);
    const result = await getAdGroupSnapshotForWindow(payload, { clientId: 1 });
    expect(result).not.toBeNull();
    expect(result!.dateRangeLabel).toBe("LAST_60_DAYS");
  });

  it("default reader skips the additive long windows", async () => {
    const payload = makeFilteringPayload([
      { ...keywordDoc(1), id: 1, dateRangeLabel: "LAST_30_DAYS" },
      { ...keywordDoc(1), id: 2, dateRangeLabel: "LAST_90_DAYS" },
    ]);
    const result = await getLatestSnapshot(payload, { clientId: 1, level: "keyword" });
    expect(result).not.toBeNull();
    expect(result!.dateRangeLabel).toBe("LAST_30_DAYS");
  });
});
