import { describe, expect, it } from "vitest";
import { getGoogleMateInitialTools, getTools } from "../../src/lib/agents/optimate-google-ads";
import type { Message } from "../../src/lib/agents/_shared/llm/types";

function userMessage(text: string): Message {
  return { role: "user", content: [{ type: "text", text }] };
}

function toolNamesFor(text: string): string[] {
  return getGoogleMateInitialTools([userMessage(text)]).map((tool) => tool.name);
}

function expectExactToolsFor(text: string, expectedNames: string[]) {
  expect(toolNamesFor(text)).toEqual([
    "request_googlemate_tool_bundle",
    "get_account_overview",
    "growth_tools_read",
    "get_client_details",
    ...expectedNames,
  ]);
}

describe("GoogleMate tool routing", () => {
  it("starts blank and generic requests with a lean router tool set instead of every audit tool", () => {
    const fullTools = getTools();

    for (const messages of [[], [userMessage("Hello")]]) {
      const initialTools = getGoogleMateInitialTools(messages);
      const names = initialTools.map((tool) => tool.name);

      expect(initialTools.length).toBeLessThan(fullTools.length / 2);
      expect(names).toEqual([
        "request_googlemate_tool_bundle",
        "get_account_overview",
        "growth_tools_read",
        "get_client_details",
      ]);
      expect(names).not.toContain("get_campaign_performance");
      expect(names).not.toContain("propose_negative_keywords");
    }
  });

  it("pre-attaches specialist bundles when the conversation clearly asks for them", () => {
    const initialTools = getGoogleMateInitialTools([
      userMessage("Review wasted spend from search terms and draft the weekly budget email."),
    ]);
    const names = initialTools.map((tool) => tool.name);

    expect(names).toContain("request_googlemate_tool_bundle");
    expect(names).toContain("get_search_terms");
    expect(names).toContain("propose_negative_keywords");
    expect(names).toContain("get_budget_management_email");
    expect(names).toContain("create_gmail_draft");
  });

  it("pre-attaches only the campaign-build bundle for geo keywords", () => {
    expectExactToolsFor("geo split", [
      "propose_campaign_restructure",
      "propose_campaign_build",
      "propose_geo_campaign_split",
      "propose_campaign_status_change",
      "propose_ad_group_create",
      "propose_ad_group_status_change",
      "propose_keywords_add",
      "get_campaign_proposal_status",
      "request_confirm",
    ]);
  });

  it("pre-attaches only the deck bundle for deck keywords", () => {
    expectExactToolsFor("build a stakeholder deck", [
      "propose_stakeholder_deck",
      "propose_deck_from_template",
    ]);
  });

  it("pre-attaches only the scheduled-tasks bundle for schedule keywords", () => {
    expectExactToolsFor("schedule this report", [
      "propose_scheduled_task",
      "list_scheduled_tasks",
      "propose_scheduled_task_update",
    ]);
  });

  it("pre-attaches memory tools when the conversation explicitly asks for memory", () => {
    expectExactToolsFor("Remember that this client hates broad-match PMax tests.", [
      "memory_search",
      "remember",
      "soul_set",
    ]);
  });

  it("keeps the legacy full tool accessor available for callers that execute tools directly", () => {
    const fullNames = getTools().map((tool) => tool.name);

    expect(fullNames).toContain("get_campaign_performance");
    expect(fullNames).toContain("propose_negative_keywords");
    expect(fullNames).toContain("create_gmail_draft");
    expect(fullNames).toContain("propose_deck_from_template");
    expect(fullNames).not.toContain("remember");
  });
});
