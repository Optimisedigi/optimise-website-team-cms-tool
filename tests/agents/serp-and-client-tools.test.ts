/**
 * Optimate-Google-Ads SERP / AI-Visibility / client-details tools.
 *
 * Mocks `payload.find` and `payload.findByID` so we can verify:
 *   - get_serp_displacement gates on client.serpMonitor.enabled
 *   - get_serp_displacement reduces multiple snapshots per
 *     (keyword, location, device) to the most recent
 *   - get_serp_displacement_alerts respects severity filter and limit
 *   - get_ai_visibility gates on client.aiVisibility.enabled and shapes bySource
 *   - get_client_details defaults to ['contact','commercial','goals'] and
 *     projects only those groups
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFind = vi.fn();
const mockFindByID = vi.fn();

vi.mock("payload", () => ({
  getPayload: vi.fn(async () => ({
    find: mockFind,
    findByID: mockFindByID,
  })),
}));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

import { getSerpDisplacement } from "@/lib/agents/optimate-google-ads/tools/get-serp-displacement";
import { getSerpDisplacementAlerts } from "@/lib/agents/optimate-google-ads/tools/get-serp-displacement-alerts";
import { getAiVisibility } from "@/lib/agents/optimate-google-ads/tools/get-ai-visibility";
import { getClientDetails } from "@/lib/agents/optimate-google-ads/tools/get-client-details";
import type { ToolContext } from "@/lib/agents/_shared/tool";

const baseCtx = (extra: Partial<ToolContext["context"]> = {}): ToolContext => ({
  agentName: "optimate-google-ads",
  agentRunId: "run_test_serp",
  context: { clientId: 42, ...extra },
  log: vi.fn(),
});

beforeEach(() => {
  mockFind.mockReset();
  mockFindByID.mockReset();
});

describe("get_serp_displacement", () => {
  it("returns enabled=false when the client has SERP Monitor disabled", async () => {
    mockFindByID.mockResolvedValueOnce({
      id: 42,
      serpMonitor: { enabled: false, keywords: [] },
    });

    const args = getSerpDisplacement.validate!({});
    const result = await getSerpDisplacement.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    expect((result.data as { enabled: boolean }).enabled).toBe(false);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("reduces multiple snapshots per (keyword, location, device) to the most recent", async () => {
    mockFindByID.mockResolvedValueOnce({
      id: 42,
      serpMonitor: { enabled: true, domain: "example.com", keywords: [{ keyword: "buy widgets" }] },
    });

    mockFind.mockResolvedValueOnce({
      docs: [
        {
          id: 1,
          keyword: "buy widgets",
          location: "au:sydney",
          device: "desktop",
          capturedAt: "2026-05-12T08:00:00.000Z",
          hasAiOverview: true,
          hasAnswerBox: false,
          hasKnowledgeGraph: false,
          hasShopping: false,
          hasLocalPack: false,
          topAdCount: 4,
          bottomAdCount: 2,
          organicPosition: 7,
        },
        {
          // Older same key — should be dropped in favour of id 1
          id: 2,
          keyword: "buy widgets",
          location: "au:sydney",
          device: "desktop",
          capturedAt: "2026-05-11T08:00:00.000Z",
          hasAiOverview: false,
          hasAnswerBox: false,
          hasKnowledgeGraph: false,
          hasShopping: false,
          hasLocalPack: false,
          topAdCount: 0,
          bottomAdCount: 0,
          organicPosition: 5,
        },
        {
          // Different device — kept independently
          id: 3,
          keyword: "buy widgets",
          location: "au:sydney",
          device: "mobile",
          capturedAt: "2026-05-12T08:00:00.000Z",
          hasAiOverview: true,
          hasAnswerBox: false,
          hasKnowledgeGraph: false,
          hasShopping: false,
          hasLocalPack: false,
          topAdCount: 3,
          bottomAdCount: 1,
          organicPosition: 9,
        },
      ],
    });

    const args = getSerpDisplacement.validate!({ range: "LAST_7_DAYS" });
    const result = await getSerpDisplacement.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    const data = result.data as {
      enabled: boolean;
      snapshotCount: number;
      snapshots: Array<{ keyword: string; device: string; aiOverview: { present: boolean }; ads: { top: number } }>;
    };
    expect(data.enabled).toBe(true);
    expect(data.snapshotCount).toBe(2); // desktop (latest) + mobile
    const desktop = data.snapshots.find((s) => s.device === "desktop");
    expect(desktop?.aiOverview.present).toBe(true);
    expect(desktop?.ads.top).toBe(4);

    // Verify the find filter shape — was scoped to the right client + date window.
    const findCall = mockFind.mock.calls[0][0];
    expect(findCall.collection).toBe("serp-displacement-snapshots");
    expect(findCall.where.client.equals).toBe(42);
    expect(findCall.where.capturedAt).toBeDefined();
  });

  it("passes a keyword filter through to the find call when provided", async () => {
    mockFindByID.mockResolvedValueOnce({
      id: 42,
      serpMonitor: { enabled: true, keywords: [{ keyword: "alpha" }, { keyword: "beta" }] },
    });
    mockFind.mockResolvedValueOnce({ docs: [] });

    const args = getSerpDisplacement.validate!({ keywords: ["alpha"] });
    await getSerpDisplacement.execute(args, baseCtx());

    const findCall = mockFind.mock.calls[0][0];
    expect(findCall.where.keyword).toEqual({ in: ["alpha"] });
  });

  it("returns an error when no clientId is in context", async () => {
    const args = getSerpDisplacement.validate!({});
    const result = await getSerpDisplacement.execute(args, baseCtx({ clientId: undefined }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/client/i);
  });
});

describe("get_serp_displacement_alerts", () => {
  it("filters by severity and caps the limit", async () => {
    mockFind.mockResolvedValueOnce({
      docs: [
        {
          id: 9,
          keyword: "buy widgets",
          alertType: "ai_overview_appeared",
          severity: "warning",
          description: "AIO now showing on this query",
          recommendedAction: "Pull a fresh content brief",
          createdAt: "2026-05-12T08:00:00.000Z",
        },
      ],
    });

    const args = getSerpDisplacementAlerts.validate!({
      limit: 9999, // should clamp to 100
      severity: ["warning", "critical", "BOGUS"],
    });
    expect(args.limit).toBe(100);
    expect(args.severity).toEqual(["warning", "critical"]);

    const result = await getSerpDisplacementAlerts.execute(args, baseCtx());
    expect(result.ok).toBe(true);
    expect((result.data as { count: number }).count).toBe(1);

    const findCall = mockFind.mock.calls[0][0];
    expect(findCall.collection).toBe("serp-displacement-alerts");
    expect(findCall.where.client.equals).toBe(42);
    expect(findCall.where.severity).toEqual({ in: ["warning", "critical"] });
    expect(findCall.limit).toBe(100);
    expect(findCall.sort).toBe("-createdAt");
  });

  it("uses the default limit of 20 and no severity filter when omitted", async () => {
    mockFind.mockResolvedValueOnce({ docs: [] });

    const args = getSerpDisplacementAlerts.validate!({});
    await getSerpDisplacementAlerts.execute(args, baseCtx());

    const findCall = mockFind.mock.calls[0][0];
    expect(findCall.limit).toBe(20);
    expect(findCall.where.severity).toBeUndefined();
  });
});

describe("get_ai_visibility", () => {
  it("returns enabled=false when the client has AI Visibility disabled", async () => {
    mockFindByID.mockResolvedValueOnce({
      id: 42,
      aiVisibility: { enabled: false },
    });

    const args = getAiVisibility.validate!({});
    const result = await getAiVisibility.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    expect((result.data as { enabled: boolean }).enabled).toBe(false);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("reports zero snapshots gracefully when feature is on but no rows exist", async () => {
    mockFindByID.mockResolvedValueOnce({ id: 42, aiVisibility: { enabled: true } });
    mockFind.mockResolvedValueOnce({ docs: [] });

    const result = await getAiVisibility.execute({}, baseCtx());
    expect(result.ok).toBe(true);
    const data = result.data as { enabled: boolean; snapshotCount: number; reason?: string };
    expect(data.enabled).toBe(true);
    expect(data.snapshotCount).toBe(0);
    expect(data.reason).toMatch(/no snapshots/i);
  });

  it("shapes bySource and respects the recent= cap (max 12)", async () => {
    mockFindByID.mockResolvedValueOnce({ id: 42, aiVisibility: { enabled: true } });
    mockFind.mockResolvedValueOnce({
      docs: [
        {
          id: 1,
          propertyId: "ga4-prop",
          periodStart: "2026-05-05",
          periodEnd: "2026-05-11",
          totalSessions: 100,
          totalUsers: 80,
          totalConversions: 4,
          conversionValue: 320,
          engagedSessions: 60,
          avgEngagementTime: 75,
          bySource: [
            {
              source: "chatgpt.com",
              assistant: "ChatGPT",
              sessions: 60,
              users: 50,
              conversions: 3,
              conversionValue: 240,
              engagedSessions: 40,
              topLandingPages: [
                { path: "/pricing", sessions: 25, conversions: 2 },
                { path: "/", sessions: 20, conversions: 1 },
              ],
            },
          ],
          shareBySource: { ChatGPT: 0.6, Perplexity: 0.4 },
          fetchedAt: "2026-05-12T01:00:00.000Z",
        },
      ],
    });

    const args = getAiVisibility.validate!({ recent: 9999 });
    expect(args.recent).toBe(12);

    const result = await getAiVisibility.execute(args, baseCtx());
    expect(result.ok).toBe(true);
    const data = result.data as {
      snapshotCount: number;
      snapshots: Array<{
        totals: { sessions: number };
        bySource: Array<{ assistant: string | null; sessions: number; topLandingPages: unknown[] }>;
      }>;
    };
    expect(data.snapshotCount).toBe(1);
    expect(data.snapshots[0].totals.sessions).toBe(100);
    expect(data.snapshots[0].bySource[0].assistant).toBe("ChatGPT");
    expect(data.snapshots[0].bySource[0].topLandingPages.length).toBe(2);

    const findCall = mockFind.mock.calls[0][0];
    expect(findCall.collection).toBe("ai-visibility-snapshots");
    expect(findCall.limit).toBe(12);
    expect(findCall.sort).toBe("-periodEnd");
  });
});

describe("get_client_details", () => {
  it("defaults to contact + commercial + goals and projects only those groups", async () => {
    mockFindByID.mockResolvedValueOnce({
      id: 42,
      name: "Acme",
      slug: "acme",
      isActive: true,
      contactName: "Pat",
      contactEmail: "pat@acme.test",
      accountManagers: [{ name: "Sam", email: "sam@agency.test" }],
      monthlyRetainer: 4500,
      clientStartDate: "2025-09-01",
      googleAdsCustomerId: "123-456-7890",
      conversionGoal: "Phone calls",
      secondaryConversionGoal: "Form submits",
      clientGoals: "Grow leads 30% YoY",
      clientNotes: [{ date: "2026-01-01", content: "shouldn't appear" }],
      accountTimeline: [{ date: "2026-01-01", description: "shouldn't appear" }],
      websiteUrl: "https://acme.test",
    });

    const args = getClientDetails.validate!({});
    const result = await getClientDetails.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    const data = result.data as {
      groupsReturned: string[];
      client: Record<string, unknown>;
    };
    expect(data.groupsReturned).toEqual(["contact", "commercial", "goals"]);
    expect(data.client.contact).toBeDefined();
    expect(data.client.commercial).toBeDefined();
    expect(data.client.goals).toBeDefined();
    expect(data.client.notes).toBeUndefined();
    expect(data.client.timeline).toBeUndefined();
    expect(data.client.business).toBeUndefined();
    expect(data.client.locations).toBeUndefined();
  });

  it("returns recent notes sorted newest first when 'notes' is requested", async () => {
    mockFindByID.mockResolvedValueOnce({
      id: 42,
      name: "Acme",
      clientNotes: [
        { date: "2026-01-01", author: "Sam", content: "old note" },
        { date: "2026-05-10", author: "Sam", content: "newest note" },
        { date: "2026-03-15", author: "Sam", content: "middle note" },
      ],
    });

    const args = getClientDetails.validate!({ fields: ["notes"], limit: 2 });
    const result = await getClientDetails.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    const data = result.data as {
      client: { notes: { totalCount: number; returned: number; items: Array<{ content: string }> } };
    };
    expect(data.client.notes.totalCount).toBe(3);
    expect(data.client.notes.returned).toBe(2);
    expect(data.client.notes.items[0].content).toBe("newest note");
    expect(data.client.notes.items[1].content).toBe("middle note");
  });

  it("'all' returns every group", async () => {
    mockFindByID.mockResolvedValueOnce({
      id: 42,
      name: "Acme",
      contactEmail: "pat@acme.test",
      monthlyRetainer: 4500,
      websiteUrl: "https://acme.test",
      hasPhysicalLocations: true,
      numberOfLocations: 3,
      conversionGoal: "Phone calls",
      clientNotes: [],
      accountTimeline: [],
    });

    const args = getClientDetails.validate!({ fields: ["all"] });
    const result = await getClientDetails.execute(args, baseCtx());

    expect(result.ok).toBe(true);
    const data = result.data as { client: Record<string, unknown> };
    expect(data.client.contact).toBeDefined();
    expect(data.client.commercial).toBeDefined();
    expect(data.client.business).toBeDefined();
    expect(data.client.locations).toBeDefined();
    expect(data.client.goals).toBeDefined();
    expect(data.client.notes).toBeDefined();
    expect(data.client.timeline).toBeDefined();
  });

  it("returns an error when there is no clientId in context", async () => {
    const args = getClientDetails.validate!({});
    const result = await getClientDetails.execute(args, baseCtx({ clientId: undefined }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/client-scoped|linked client/i);
  });
});
