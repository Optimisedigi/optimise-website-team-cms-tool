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

  // Google Ads action payload construction (selected-client customer ID and
  // metadata) is covered in google-ads-change-previews.test.ts: the tool now
  // stores a preview instead of calling Growth Tools.

});
