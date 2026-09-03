import { beforeEach, describe, expect, it, vi } from "vitest";

import { normaliseChangeEvent } from "@/lib/google-ads-automation/fetch";
import { isGoogleAutomated, sourceLabel, summariseChangeEvent } from "@/lib/google-ads-automation/summarise";
import { sumWindow, normaliseDailyMetrics } from "@/lib/google-ads-automation/impact";
import { buildEventDoc, cronWindow, normaliseCustomerId, runGoogleAdsAutomationCron } from "@/lib/google-ads-automation/cron";

vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("payload", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getPayload: vi.fn(),
}));

// ── summarise ─────────────────────────────────────────────────────────────

describe("isGoogleAutomated", () => {
  it("flags only the Google-automation client types", () => {
    for (const type of [
      "GOOGLE_ADS_RECOMMENDATIONS",
      "GOOGLE_ADS_RECOMMENDATIONS_SUBSCRIPTION",
      "GOOGLE_ADS_AUTOMATED_RULE",
      "GOOGLE_ADS_SCRIPTS",
      "INTERNAL_TOOL",
      "OTHER",
    ]) {
      expect(isGoogleAutomated(type)).toBe(true);
    }
    expect(isGoogleAutomated("GOOGLE_ADS_API")).toBe(false);
    expect(isGoogleAutomated("GOOGLE_ADS_WEB_CLIENT")).toBe(false);
    expect(isGoogleAutomated(undefined)).toBe(false);
  });
});

describe("summariseChangeEvent", () => {
  it("describes a budget change with old → new values", () => {
    const sentence = summariseChangeEvent({
      changeResourceType: "CAMPAIGN_BUDGET",
      resourceChangeOperation: "UPDATE",
      clientType: "GOOGLE_ADS_RECOMMENDATIONS_SUBSCRIPTION",
      campaignName: "Search — Brand",
      changedFields: ["campaign_budget.amount_micros"],
      oldValues: { campaignBudget: { amountMicros: 50000000 } },
      newValues: { campaignBudget: { amountMicros: 80000000 } },
    });
    expect(sentence).toBe(
      "Google auto-applied recommendation updated campaign budget on Search — Brand (amount_micros: 50000000 → 80000000).",
    );
  });

  it("handles each resource type with a readable noun", () => {
    const cases: Array<[string, string]> = [
      ["CAMPAIGN", "campaign"],
      ["AD_GROUP", "ad group"],
      ["AD_GROUP_CRITERION", "keyword"],
      ["AD_GROUP_AD", "ad"],
      ["CAMPAIGN_CRITERION", "campaign targeting"],
      ["BIDDING_STRATEGY", "bid strategy"],
      ["FEED_ITEM_TARGET", "feed item target"],
    ];
    for (const [type, noun] of cases) {
      const sentence = summariseChangeEvent({
        changeResourceType: type,
        resourceChangeOperation: "CREATE",
        clientType: "GOOGLE_ADS_AUTOMATED_RULE",
      });
      expect(sentence).toBe(`Google automated rule created ${noun}.`);
    }
  });

  it("truncates long field lists rather than dumping everything", () => {
    const sentence = summariseChangeEvent({
      changeResourceType: "CAMPAIGN",
      resourceChangeOperation: "UPDATE",
      clientType: "GOOGLE_ADS_API",
      changedFields: ["campaign.a", "campaign.b", "campaign.c", "campaign.d", "campaign.e"],
      oldValues: {},
      newValues: {},
    });
    expect(sentence).toContain("+2 more");
    expect(sourceLabel("GOOGLE_ADS_API")).toBe("Our tooling (API)");
  });
});

// ── fetch normalisation ───────────────────────────────────────────────────

describe("normaliseChangeEvent", () => {
  const expected = {
    resourceName: "customers/1/changeEvents/xyz",
    changeDateTime: "2026-09-01 10:00:00",
    changeResourceType: "CAMPAIGN_BUDGET",
    clientType: "GOOGLE_ADS_RECOMMENDATIONS_SUBSCRIPTION",
    campaignId: "77",
  };

  it("reads the camelCase transport shape", () => {
    const result = normaliseChangeEvent({
      changeEvent: {
        resourceName: expected.resourceName,
        changeDateTime: expected.changeDateTime,
        changeResourceType: expected.changeResourceType,
        clientType: expected.clientType,
        campaign: "customers/1/campaigns/77",
        changedFields: "campaign_budget.amount_micros,campaign.name",
        newResource: { campaign: { name: "Brand" } },
      },
    });
    expect(result).toMatchObject(expected);
    expect(result?.changedFields).toEqual(["campaign_budget.amount_micros", "campaign.name"]);
    expect(result?.campaignName).toBe("Brand");
  });

  it("reads the snake_case transport shape and FieldMask objects", () => {
    const result = normaliseChangeEvent({
      change_event: {
        resource_name: expected.resourceName,
        change_date_time: expected.changeDateTime,
        change_resource_type: expected.changeResourceType,
        client_type: expected.clientType,
        change_resource_name: "customers/1/campaigns/77",
        changed_fields: { paths: ["campaign.status"] },
      },
    });
    expect(result).toMatchObject(expected);
    expect(result?.changedFields).toEqual(["campaign.status"]);
  });

  it("drops rows without a resource name — they cannot be deduped", () => {
    expect(normaliseChangeEvent({ changeEvent: { changeDateTime: "x" } })).toBeNull();
    expect(normaliseChangeEvent(null)).toBeNull();
  });
});

// ── window + customer id ──────────────────────────────────────────────────

describe("cronWindow", () => {
  it("looks back three days so a missed run self-heals", () => {
    expect(cronWindow(new Date("2026-09-03T05:30:00Z"))).toEqual({ startDay: "2026-09-01", endDay: "2026-09-03" });
  });

  it("crosses month boundaries", () => {
    expect(cronWindow(new Date("2026-09-01T05:30:00Z")).startDay).toBe("2026-08-30");
  });
});

describe("normaliseCustomerId", () => {
  it("strips dashes and rejects anything that is not ten digits", () => {
    expect(normaliseCustomerId("342-535-3766")).toBe("3425353766");
    expect(normaliseCustomerId("12345")).toBeNull();
    expect(normaliseCustomerId(null)).toBeNull();
  });
});

// ── impact windowing ──────────────────────────────────────────────────────

describe("impact windows", () => {
  const metrics = [
    { date: "2026-08-20", campaignId: "77", cost: 10, conversions: 1 },
    { date: "2026-08-25", campaignId: "77", cost: 20, conversions: 2 },
    { date: "2026-08-26", campaignId: "77", cost: 40, conversions: 1 },
    { date: "2026-08-26", campaignId: "88", cost: 999, conversions: 99 },
  ];

  it("sums only the requested campaign inside the inclusive window", () => {
    expect(sumWindow(metrics, "77", "2026-08-19", "2026-08-25")).toEqual({ spend: 30, conversions: 3 });
    expect(sumWindow(metrics, "77", "2026-08-26", "2026-09-01")).toEqual({ spend: 40, conversions: 1 });
  });

  it("normalises the day-segmented metrics response", () => {
    expect(
      normaliseDailyMetrics({ metrics: [{ segment: { date: "2026-08-26" }, campaignId: "77", cost: 5, conversions: 1 }, { campaignId: "x" }] }),
    ).toEqual([{ date: "2026-08-26", campaignId: "77", cost: 5, conversions: 1 }]);
  });
});

// ── cron dedupe ───────────────────────────────────────────────────────────

function event(resourceName: string, clientType = "GOOGLE_ADS_RECOMMENDATIONS_SUBSCRIPTION") {
  return {
    resourceName,
    changeDateTime: "2026-09-02 10:00:00",
    changeResourceType: "CAMPAIGN",
    resourceChangeOperation: "UPDATE",
    clientType,
    userEmail: "",
    changeResourceName: "customers/1/campaigns/77",
    campaignId: "77",
    campaignName: "Brand",
    changedFields: ["campaign.status"],
    oldValues: {},
    newValues: {},
  };
}

describe("runGoogleAdsAutomationCron", () => {
  const created: Array<Record<string, unknown>> = [];
  let stored: string[] = [];

  const payload = {
    find: vi.fn(async ({ collection, where }: any) => {
      if (collection === "clients") {
        return { docs: [{ id: 1, googleAdsCustomerId: "342-535-3766" }, { id: 2, googleAdsCustomerId: "bad" }] };
      }
      const wanted: string[] = where?.resourceName?.in ?? [];
      return { docs: stored.filter((r) => wanted.includes(r)).map((resourceName) => ({ resourceName })) };
    }),
    create: vi.fn(async ({ data }: any) => {
      created.push(data);
      stored.push(String(data.resourceName));
      return { id: created.length };
    }),
    update: vi.fn(),
  } as any;

  beforeEach(() => {
    created.length = 0;
    stored = [];
    payload.find.mockClear();
    payload.create.mockClear();
  });

  const fetchEvents = vi.fn(async () => ({ ok: true, events: [event("customers/1/changeEvents/a"), event("customers/1/changeEvents/b", "GOOGLE_ADS_API")] }));

  it("creates one row per event and skips clients without a valid customer id", async () => {
    const summary = await runGoogleAdsAutomationCron({ payload, fetchEvents: fetchEvents as any, computeImpact: false, now: () => new Date("2026-09-03T05:30:00Z") });

    expect(summary.clientsProcessed).toBe(1);
    expect(summary.eventsCreated).toBe(2);
    expect(created).toHaveLength(2);
    expect(created[0].isGoogleAutomated).toBe(true);
    // Our own API mutations are stored but not tagged as Google automation.
    expect(created[1].isGoogleAutomated).toBe(false);
    expect(summary.startDay).toBe("2026-09-01");
  });

  it("creates zero duplicates on a second run over the same window", async () => {
    const opts = { payload, fetchEvents: fetchEvents as any, computeImpact: false, now: () => new Date("2026-09-03T05:30:00Z") };
    await runGoogleAdsAutomationCron(opts);
    const second = await runGoogleAdsAutomationCron(opts);

    expect(second.eventsCreated).toBe(0);
    expect(second.perClient[0].skippedExisting).toBe(2);
    expect(created).toHaveLength(2);
  });

  it("records a fetch failure without aborting the run", async () => {
    const summary = await runGoogleAdsAutomationCron({
      payload,
      fetchEvents: (async () => ({ ok: false, events: [], error: "upstream 503" })) as any,
      computeImpact: false,
    });
    expect(summary.clientsErrored).toBe(1);
    expect(summary.eventsCreated).toBe(0);
    expect(summary.perClient[0].error).toBe("upstream 503");
  });
});

describe("buildEventDoc", () => {
  it("carries the dedupe key and a human summary", () => {
    const doc = buildEventDoc(1, "3425353766", event("customers/1/changeEvents/a"));
    expect(doc.resourceName).toBe("customers/1/changeEvents/a");
    expect(doc.reviewStatus).toBe("unreviewed");
    expect(String(doc.summary)).toContain("Google auto-applied recommendation");
  });
});

describe("summariseChangeEvent field resolution", () => {
  // Google sends bare field names relative to the resource, while the
  // snapshot is wrapped in a resource key — both must resolve to values.
  it("resolves a bare field name against the wrapped resource", () => {
    expect(
      summariseChangeEvent({
        changeResourceType: "AD_GROUP",
        resourceChangeOperation: "UPDATE",
        clientType: "GOOGLE_ADS_WEB_CLIENT",
        changedFields: ["status"],
        oldValues: { adGroup: { status: "ENABLED" } },
        newValues: { adGroup: { status: "PAUSED" } },
      }),
    ).toBe("A person in the Ads UI updated ad group (status: ENABLED → PAUSED).");
  });

  it("still resolves a fully-qualified mask", () => {
    expect(
      summariseChangeEvent({
        changeResourceType: "CAMPAIGN",
        resourceChangeOperation: "UPDATE",
        clientType: "GOOGLE_ADS_SCRIPTS",
        changedFields: ["campaign.name"],
        oldValues: { campaign: { name: "Old" } },
        newValues: { campaign: { name: "New" } },
      }),
    ).toBe("Google Ads script updated campaign (name: Old → New).");
  });
});
