/**
 * Human-readable catalog of Optimate-Google-Ads tools.
 *
 * Single source of truth: tool descriptions come straight from the registered
 * `getTools()` result — never duplicated. This file only adds a thin layer of
 * grouping (which category each tool belongs to + a label/colour per group).
 *
 * Used by:
 *   - the in-chat "?" popover (OptiMateToolsHelp.tsx)
 *   - GET /api/agent-tool-catalog
 *
 * Adding a new tool? It will appear under "Other" until you map its name to a
 * category in TOOL_CATEGORY_MAP below. The lint-style assertion at the bottom
 * keeps that honest in tests.
 */

import { getTools } from "./index";

export type ToolCategoryKey =
  | "read-google-ads"
  | "read-search-and-ai"
  | "read-pipeline"
  | "read-client-info"
  | "read-scheduled"
  | "propose-budget"
  | "propose-negatives"
  | "propose-structure"
  | "propose-ad-copy"
  | "propose-scheduled"
  | "propose-deck"
  | "memory";

interface CategoryMeta {
  key: ToolCategoryKey;
  label: string;
  /** One-line "what this group is for" line under the heading. */
  blurb: string;
  /** Tailwind-ish hex for the heading dot — kept in-line so the popover
   *  doesn't depend on a CSS framework. */
  color: string;
  /** Display order. Lower = earlier. */
  order: number;
}

export const TOOL_CATEGORIES: Record<ToolCategoryKey, CategoryMeta> = {
  "read-google-ads": {
    key: "read-google-ads",
    label: "Read \u2014 Google Ads",
    blurb: "Pulls live performance numbers from the linked Google Ads account.",
    color: "#2563eb",
    order: 10,
  },
  "read-search-and-ai": {
    key: "read-search-and-ai",
    label: "Read \u2014 Search Console, GA4, SERP & AI Visibility",
    blurb: "Organic + AI assistant traffic and SERP layout snapshots.",
    color: "#7c3aed",
    order: 20,
  },
  "read-pipeline": {
    key: "read-pipeline",
    label: "Read \u2014 Pipeline status",
    blurb: "Status of in-flight campaign restructure / build / ad copy work.",
    color: "#0891b2",
    order: 30,
  },
  "read-client-info": {
    key: "read-client-info",
    label: "Read \u2014 Client info",
    blurb: "On-demand client record fields. Not pre-loaded into context.",
    color: "#0d9488",
    order: 40,
  },
  "read-scheduled": {
    key: "read-scheduled",
    label: "Read \u2014 Scheduled tasks",
    blurb: "Lists the recurring agent reports you've set up.",
    color: "#475569",
    order: 50,
  },
  "propose-budget": {
    key: "propose-budget",
    label: "Propose \u2014 Budgets",
    blurb: "Queues budget changes (CMS allocations or live Google Ads pushes) for human approval.",
    color: "#059669",
    order: 60,
  },
  "propose-negatives": {
    key: "propose-negatives",
    label: "Propose \u2014 Negative keywords",
    blurb: "Queues negative-keyword list changes for human approval.",
    color: "#16a34a",
    order: 70,
  },
  "propose-structure": {
    key: "propose-structure",
    label: "Propose \u2014 Campaign structure",
    blurb: "Queues structural changes (new campaigns, restructures, builds).",
    color: "#d97706",
    order: 80,
  },
  "propose-ad-copy": {
    key: "propose-ad-copy",
    label: "Propose \u2014 Ad copy",
    blurb: "Queues RSA generation runs and live ad-copy deploys for approval.",
    color: "#ea580c",
    order: 90,
  },
  "propose-scheduled": {
    key: "propose-scheduled",
    label: "Propose \u2014 Scheduled tasks",
    blurb: "Queues recurring agent reports delivered to your Gmail Drafts.",
    color: "#9333ea",
    order: 100,
  },
  "propose-deck": {
    key: "propose-deck",
    label: "Propose \u2014 Stakeholder deck",
    blurb: "Queues a 5-slide client recap deck for the launch \u2192 today window.",
    color: "#db2777",
    order: 110,
  },
  memory: {
    key: "memory",
    label: "Memory & soul",
    blurb: "Lazy-loaded long-term memory: durable facts about the client and how to communicate.",
    color: "#6b7280",
    order: 120,
  },
};

/**
 * Maps each registered tool name to a category. Tools that aren't mapped
 * appear under an "Other" bucket so nothing silently disappears from the UI.
 */
export const TOOL_CATEGORY_MAP: Record<string, ToolCategoryKey> = {
  // Read — Google Ads
  get_account_overview: "read-google-ads",
  get_campaign_performance: "read-google-ads",
  get_search_terms: "read-google-ads",

  // Read — Search Console / GA4 / SERP / AI Visibility
  get_ga4_overview: "read-search-and-ai",
  get_gsc_overview: "read-search-and-ai",
  get_gsc_branded_split: "read-search-and-ai",
  get_gsc_indexing_status: "read-search-and-ai",
  get_serp_displacement: "read-search-and-ai",
  get_serp_displacement_alerts: "read-search-and-ai",
  get_ai_visibility: "read-search-and-ai",

  // Read — pipeline
  get_campaign_proposal_status: "read-pipeline",

  // Read — client info
  get_client_details: "read-client-info",

  // Read — scheduled
  list_scheduled_tasks: "read-scheduled",

  // Propose — budgets
  propose_budget_update: "propose-budget",
  propose_budget_push_live: "propose-budget",

  // Propose — negatives
  propose_negative_keywords: "propose-negatives",
  propose_nkl_create: "propose-negatives",
  propose_nkl_update: "propose-negatives",
  propose_nkl_push_live: "propose-negatives",

  // Propose — structure
  propose_campaign_restructure: "propose-structure",
  propose_campaign_build: "propose-structure",

  // Propose — ad copy
  propose_ad_copy_generate: "propose-ad-copy",
  propose_ad_copy_deploy: "propose-ad-copy",

  // Propose — scheduled
  propose_scheduled_task: "propose-scheduled",
  propose_scheduled_task_update: "propose-scheduled",

  // Propose — deck
  propose_stakeholder_deck: "propose-deck",

  // Memory
  remember: "memory",
  memory_search: "memory",
  soul_set: "memory",
};

export interface CatalogTool {
  name: string;
  /** Friendly label derived from the tool name (e.g. get_search_terms → Search terms). */
  label: string;
  description: string;
  /** Whether the tool queues a human-approval row (vs read-only). */
  isPropose: boolean;
}

export interface CatalogCategory extends CategoryMeta {
  tools: CatalogTool[];
}

/**
 * Convert snake_case tool names into a human-friendly label by stripping the
 * leading "get_" / "list_" / "propose_" prefix and title-casing the rest.
 *
 * - get_search_terms        → "Search terms"
 * - propose_nkl_push_live   → "NKL push live"
 * - propose_campaign_build  → "Campaign build"
 * - memory_search           → "Memory search"
 */
export function toolLabel(name: string): string {
  const stripped = name
    .replace(/^get_/, "")
    .replace(/^list_/, "")
    .replace(/^propose_/, "");
  const words = stripped.split("_").filter(Boolean);
  if (words.length === 0) return name;
  // Preserve well-known acronyms.
  const ACRONYMS = new Set(["nkl", "cms", "rsa", "cpa", "roas", "cpc", "ga4", "gsc", "aio", "mtd", "pmax", "ai"]);
  const titled = words.map((w) =>
    ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1),
  );
  return titled.join(" ");
}

/**
 * Build the grouped catalog from the live tool registry. Pure, deterministic,
 * safe to call from a server route or imported into a unit test.
 */
export function buildToolCatalog(): CatalogCategory[] {
  const tools = getTools();
  const grouped = new Map<ToolCategoryKey | "other", CatalogTool[]>();

  for (const tool of tools) {
    const name = tool.name;
    const category = TOOL_CATEGORY_MAP[name] ?? "other";
    const list = grouped.get(category as ToolCategoryKey) ?? [];
    list.push({
      name,
      label: toolLabel(name),
      description: tool.description,
      isPropose: name.startsWith("propose_"),
    });
    grouped.set(category as ToolCategoryKey, list);
  }

  const out: CatalogCategory[] = [];
  for (const meta of Object.values(TOOL_CATEGORIES)) {
    const tools = grouped.get(meta.key);
    if (tools && tools.length > 0) {
      // Sort tools alphabetically by label within each category for stable
      // rendering and easier diffing in tests.
      tools.sort((a, b) => a.label.localeCompare(b.label));
      out.push({ ...meta, tools });
    }
  }
  // Append any uncategorised tools at the end so nothing is lost silently.
  const other = grouped.get("other");
  if (other && other.length > 0) {
    other.sort((a, b) => a.label.localeCompare(b.label));
    out.push({
      key: "read-google-ads", // dummy; replaced below
      label: "Other",
      blurb: "Tools not yet mapped to a category. Update tool-catalog.ts to fix.",
      color: "#9ca3af",
      order: 999,
      tools: other,
    } as unknown as CatalogCategory);
  }

  // Final sort by category order.
  out.sort((a, b) => a.order - b.order);
  return out;
}

/** Total tool count — handy for the popover header ("OptiMate has access to N tools"). */
export function totalToolCount(): number {
  return getTools().length;
}
