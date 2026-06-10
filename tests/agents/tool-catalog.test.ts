/**
 * Optimate-Google-Ads tool catalog.
 *
 * Asserts that:
 *   - every registered tool is mapped to a category (no silent "Other" bucket
 *     showing up in production unless we deliberately add a tool without
 *     mapping it)
 *   - propose_* tools are flagged isPropose=true
 *   - read tools are flagged isPropose=false
 *   - the catalog is sorted by category order
 *   - toolLabel() humanises snake_case names (and respects acronyms)
 *
 * The agent index re-exports React components and other heavy deps that
 * vitest can't resolve in unit tests. We mock it with a small fixture so
 * this suite stays isolated from unrelated WIP in the same module graph.
 */

import { describe, it, expect, vi } from "vitest";

// Fixture: mirrors the real registered tool set as of 2026-05-14. If a tool
// is added in production it must be added both here AND to TOOL_CATEGORY_MAP.
// The 'every registered tool is mapped' test will fail loudly if the fixture
// drifts from the map, which is exactly what we want.
const FIXTURE_TOOLS = [
  { name: "get_account_overview", description: "Account totals." },
  { name: "get_campaign_performance", description: "Per-campaign performance." },
  { name: "get_ad_group_performance", description: "Per-ad-group performance." },
  { name: "get_search_terms", description: "User search queries." },
  { name: "get_budget_management_email", description: "Gmail-ready budget management email HTML." },
  { name: "create_gmail_draft", description: "Create one-off Gmail draft." },
  { name: "propose_negative_keywords", description: "Quick negative-keyword propose." },
  { name: "propose_nkl_create", description: "Create a new NKL." },
  { name: "propose_nkl_update", description: "Update an existing NKL." },
  { name: "propose_nkl_push_live", description: "Push NKL keywords to Google Ads." },
  { name: "propose_budget_update", description: "Save budget allocations to CMS." },
  { name: "propose_budget_push_live", description: "Push daily budgets to Google Ads." },
  { name: "propose_ad_copy_generate", description: "Prepare ad-copy run." },
  { name: "propose_ad_copy_deploy", description: "Deploy approved RSAs." },
  { name: "get_ga4_overview", description: "GA4 traffic summary." },
  { name: "get_gsc_overview", description: "GSC summary." },
  { name: "get_gsc_branded_split", description: "Brand vs non-brand split." },
  { name: "get_gsc_indexing_status", description: "GSC indexing status." },
  { name: "get_serp_displacement", description: "Latest SERP snapshots." },
  { name: "get_serp_displacement_alerts", description: "Recent SERP alerts." },
  { name: "get_ai_visibility", description: "AI Visibility snapshots." },
  { name: "get_client_details", description: "On-demand client info." },
  { name: "propose_campaign_restructure", description: "Queue restructure proposal." },
  { name: "propose_campaign_build", description: "Build approved structure." },
  { name: "propose_ad_group_create", description: "Create one ad group in an existing campaign." },
  { name: "propose_keywords_add", description: "Bulk-add keywords to an ad group." },
  { name: "get_campaign_proposal_status", description: "Read pipeline status." },
  { name: "propose_scheduled_task", description: "Create recurring task." },
  { name: "list_scheduled_tasks", description: "List user's tasks." },
  { name: "propose_scheduled_task_update", description: "Edit/pause a task." },
  { name: "propose_stakeholder_deck", description: "Queue a recap deck." },
  { name: "request_confirm", description: "Confirm-gate Yes/No bubble." },
  { name: "remember", description: "Save a durable fact." },
  { name: "memory_search", description: "Search saved facts." },
  { name: "soul_set", description: "Save a soul lesson." },
];

vi.mock("@/lib/agents/optimate-google-ads", () => ({
  getTools: () => FIXTURE_TOOLS,
}));

import {
  buildToolCatalog,
  totalToolCount,
  toolLabel,
  TOOL_CATEGORY_MAP,
  TOOL_CATEGORIES,
} from "@/lib/agents/optimate-google-ads/tool-catalog";
import { getTools } from "@/lib/agents/optimate-google-ads";

describe("tool-catalog", () => {
  it("every registered tool is mapped to a category", () => {
    const registered = getTools().map((t) => t.name);
    const unmapped = registered.filter((n) => !TOOL_CATEGORY_MAP[n]);
    // If this fails, add the missing tool to TOOL_CATEGORY_MAP.
    expect(unmapped, `unmapped tools: ${unmapped.join(", ")}`).toEqual([]);
  });

  it("totalToolCount matches the registry length", () => {
    expect(totalToolCount()).toBe(getTools().length);
  });

  it("buildToolCatalog returns categories sorted by order", () => {
    const cats = buildToolCatalog();
    const orders = cats.map((c) => c.order);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
  });

  it("propose_* tools are flagged isPropose=true and read tools false", () => {
    const cats = buildToolCatalog();
    for (const cat of cats) {
      for (const tool of cat.tools) {
        const expected = tool.name.startsWith("propose_");
        expect(tool.isPropose, `${tool.name} flag mismatch`).toBe(expected);
      }
    }
  });

  it("includes the new Google Ads / SERP / AI Visibility / client tools we just shipped", () => {
    const cats = buildToolCatalog();
    const allTools = cats.flatMap((c) => c.tools.map((t) => t.name));
    expect(allTools).toContain("get_ad_group_performance");
    expect(allTools).toContain("get_serp_displacement");
    expect(allTools).toContain("get_serp_displacement_alerts");
    expect(allTools).toContain("get_ai_visibility");
    expect(allTools).toContain("get_client_details");
  });

  it("groups SERP + AI Visibility under read-search-and-ai", () => {
    const cats = buildToolCatalog();
    const group = cats.find((c) => c.label === TOOL_CATEGORIES["read-search-and-ai"].label);
    expect(group).toBeDefined();
    const names = group!.tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining([
      "get_serp_displacement",
      "get_serp_displacement_alerts",
      "get_ai_visibility",
      "get_gsc_overview",
      "get_ga4_overview",
    ]));
  });

  it("descriptions come straight from the registered tools", () => {
    const registered = new Map(getTools().map((t) => [t.name, t.description]));
    const cats = buildToolCatalog();
    for (const cat of cats) {
      for (const tool of cat.tools) {
        expect(tool.description).toBe(registered.get(tool.name));
      }
    }
  });
});

describe("toolLabel", () => {
  it("strips read prefixes and title-cases the rest", () => {
    expect(toolLabel("get_search_terms")).toBe("Search Terms");
    expect(toolLabel("get_account_overview")).toBe("Account Overview");
    expect(toolLabel("list_scheduled_tasks")).toBe("Scheduled Tasks");
  });

  it("strips propose prefix", () => {
    expect(toolLabel("propose_campaign_build")).toBe("Campaign Build");
    expect(toolLabel("propose_ad_copy_deploy")).toBe("Ad Copy Deploy");
  });

  it("uppercases known acronyms", () => {
    expect(toolLabel("get_ga4_overview")).toBe("GA4 Overview");
    expect(toolLabel("get_gsc_overview")).toBe("GSC Overview");
    expect(toolLabel("propose_nkl_create")).toBe("NKL Create");
    expect(toolLabel("get_ai_visibility")).toBe("AI Visibility");
  });

  it("handles tools with no underscore body after the prefix", () => {
    expect(toolLabel("remember")).toBe("Remember");
  });
});
