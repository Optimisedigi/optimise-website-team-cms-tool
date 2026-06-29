import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { getGoogleMateInitialTools, getTools } from "../../src/lib/agents/optimate-google-ads";
import type { Message } from "../../src/lib/agents/_shared/llm/types";

function userMessage(text: string): Message {
  return { role: "user", content: [{ type: "text", text }] };
}

describe("OptiMax Growth Tools execute actions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("registers direct Growth Tools action tools", () => {
    const names = getTools().map((tool) => tool.name);

    expect(names).toContain("execute_google_ads_action");
    expect(names).toContain("execute_ga4_action");
    expect(names).toContain("execute_gtm_action");
    expect(names).toContain("review_tracking_changes");
  });

  it("pre-attaches action tools for direct live-change requests", () => {
    const names = getGoogleMateInitialTools([userMessage("Pause this campaign and publish the GTM tag setup")]).map((tool) => tool.name);

    expect(names).toContain("execute_google_ads_action");
    expect(names).toContain("execute_gtm_action");
    expect(names).toContain("review_tracking_changes");
  });

  it("keeps execute tools available even when external-context restrictions hide proposal/draft tools", () => {
    const names = getGoogleMateInitialTools([userMessage("Pause the campaign now")], {
      restrictExternalContextActions: true,
    }).map((tool) => tool.name);

    expect(names).toContain("execute_google_ads_action");
    expect(names).not.toContain("propose_campaign_status_change");
  });

  it("requests GA4 edit scope as well as readonly", () => {
    const source = readFileSync("src/lib/ga4-service.ts", "utf8");

    expect(source).toContain("https://www.googleapis.com/auth/analytics.readonly");
    expect(source).toContain("https://www.googleapis.com/auth/analytics.edit");
  });

  it("constructs Google Ads action payloads with selected-client customer ID and metadata", async () => {
    vi.stubEnv("INTERNAL_API_KEY", "test-key");
    vi.stubEnv("GROWTH_TOOLS_URL", "https://growth-tools.test");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ changed: 1, resourceIds: ["123"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const tool = getTools().find((candidate) => candidate.name === "execute_google_ads_action");
    expect(tool).toBeTruthy();

    const validated = tool!.validate!({
      action: "campaign_status_update",
      payload: { campaignId: "111", status: "PAUSED" },
      summary: "Pause underperforming campaign",
    });
    const result = await tool!.execute(validated as never, {
      agentName: "optimate-google-ads",
      agentRunId: "run-1",
      context: {
        customerId: "123-456-7890",
        clientId: 42,
        auditId: 99,
        userId: 7,
      },
      log: () => undefined,
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://growth-tools.test/api/google-ads/campaigns/status",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-internal-key": "test-key" }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      action: "campaign_status_update",
      customerId: "1234567890",
      campaignId: "111",
      status: "PAUSED",
      agentRunId: "run-1",
      clientId: 42,
      auditId: 99,
      userId: 7,
      source: "optimax",
    });
  });
});
