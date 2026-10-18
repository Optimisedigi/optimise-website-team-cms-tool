/**
 * AdminMate tool bundles: which tool schemas go out with each request.
 *
 * Production use (activity log, Jul to Oct 2026, 38 runs): only find_clients
 * (45% of runs) and get_client_details (21%) were used in at least one run in
 * five, so those plus the small duplicate check stay loaded. Each staging
 * flow and the link tool load when the admin's own words call for them, or
 * when the model asks with request_adminmate_tools. Sending all 13 schemas
 * on every request cost about 17.5K characters.
 */

import type { CanonicalTool } from "../_shared/tool";
import type { Message } from "../_shared/llm/types";

/** Always sent. create_gmail_draft is only registered on attached-email turns. */
const CORE_TOOL_NAMES: ReadonlySet<string> = new Set([
  "find_clients",
  "find_similar_clients",
  "get_client_details",
  "create_gmail_draft",
]);

export const ADMINMATE_TOOL_BUNDLES = {
  clients: ["stage_client"],
  proposals: ["stage_client_proposal"],
  contracts: ["list_contract_templates", "stage_contract"],
  payments: ["stage_one_off_payment"],
  meetings: ["find_meeting_prospects", "stage_meeting_scheduler", "find_meeting_schedulers", "stage_meeting_invites"],
  links: ["get_client_links"],
} as const satisfies Record<string, readonly string[]>;

export type AdminMateToolBundleName = keyof typeof ADMINMATE_TOOL_BUNDLES;

export const ADMINMATE_TOOL_BUNDLE_NAMES = Object.keys(ADMINMATE_TOOL_BUNDLES) as AdminMateToolBundleName[];

function isBundleName(value: unknown): value is AdminMateToolBundleName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ADMINMATE_TOOL_BUNDLES, value);
}

/**
 * Pre-load patterns, matched against every user message in the conversation
 * (not assistant replies), so a multi-turn flow keeps its tools. Each covers
 * the matching latestUserIntent pattern in index.ts, so a correction retry
 * always has the staging tool it asks for.
 */
const BUNDLE_PATTERNS: ReadonlyArray<readonly [AdminMateToolBundleName, RegExp]> = [
  ["clients", /\b(create|add|set ?up|stage|new)\b[\s\S]{0,80}\bclients?\b|\bonboard/],
  ["proposals", /\bproposals?\b/],
  [
    "contracts",
    /\b(create|add|set ?up|stage|new|draft|prepare|generate|send|make)\b[\s\S]{0,80}\b(contracts?|agreements?)\b|\btemplates?\b/,
  ],
  ["payments", /\bpayments?\b|\bpay link\b|\bcharge\b|\bsurcharge\b|\bhosting (fee|charge)\b|\binvoice\b/],
  ["meetings", /\bmeetings?\b|\bschedul(e|er|ing)\b|\binvites?\b|\bbook (a |the )?call\b|\bavailability\b/],
  ["links", /\blinks?\b|\burls?\b|\bopen\b|\bpdf\b|\bclient hub\b|\bhub page\b|\bbuttons?\b/],
];

export function detectAdminMateToolBundles(messages: Message[]): AdminMateToolBundleName[] {
  const text = messages
    .filter((message) => message.role === "user")
    .flatMap((message) => message.content)
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
    .toLowerCase();
  if (!text.trim()) return [];
  return BUNDLE_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([bundle]) => bundle);
}

/** Core tools plus the named bundles, in registration order. */
export function selectAdminMateTools(
  allTools: readonly CanonicalTool<unknown>[],
  bundles: readonly AdminMateToolBundleName[],
): CanonicalTool<unknown>[] {
  const wanted = new Set<string>(CORE_TOOL_NAMES);
  for (const bundle of bundles) for (const name of ADMINMATE_TOOL_BUNDLES[bundle]) wanted.add(name);
  return allTools.filter((tool) => wanted.has(tool.name));
}

function bundleTools(
  allTools: readonly CanonicalTool<unknown>[],
  bundles: readonly AdminMateToolBundleName[],
): CanonicalTool<unknown>[] {
  const wanted = new Set<string>(bundles.flatMap((bundle) => [...ADMINMATE_TOOL_BUNDLES[bundle]]));
  return allTools.filter((tool) => wanted.has(tool.name));
}

const BUNDLE_SUMMARY = ADMINMATE_TOOL_BUNDLE_NAMES.map(
  (bundle) => `${bundle} (${ADMINMATE_TOOL_BUNDLES[bundle].join(", ")})`,
).join("; ");

/** Prompt line telling the model how to reach tools that are not loaded yet. */
export const ADMINMATE_TOOL_LOADING_NOTE =
  `Tool loading: find_clients, find_similar_clients and get_client_details are always available. Other tools load in bundles: ${BUNDLE_SUMMARY}. ` +
  "If a tool you need is not in your tool list, call request_adminmate_tools with its bundle first, then use it. Never tell the admin a flow is unavailable because its tool is not loaded yet.";

/**
 * Lets the model attach a bundle mid-run. The tool itself has no side
 * effects; resolveAdminMateToolBundles adds the schemas after it runs.
 */
export function createAdminMateToolRequestTool(
  allTools: readonly CanonicalTool<unknown>[],
): CanonicalTool<{ bundles: AdminMateToolBundleName[] }> {
  return {
    name: "request_adminmate_tools",
    description:
      "Attach AdminMate tools that are not in your tool list yet, before you use them. Bundles: " + BUNDLE_SUMMARY + ".",
    inputSchema: {
      type: "object",
      properties: {
        bundles: {
          type: "array",
          minItems: 1,
          items: { type: "string", enum: [...ADMINMATE_TOOL_BUNDLE_NAMES] },
          description: "Bundles to attach before your next step.",
        },
      },
      required: ["bundles"],
      additionalProperties: false,
    },
    validate(raw) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error("Expected an object with bundles.");
      }
      const requested = (raw as Record<string, unknown>).bundles;
      if (!Array.isArray(requested)) throw new Error("bundles must be an array.");
      const bundles = Array.from(new Set(requested.filter(isBundleName)));
      if (bundles.length === 0) {
        throw new Error(`At least one valid bundle is required: ${ADMINMATE_TOOL_BUNDLE_NAMES.join(", ")}.`);
      }
      return { bundles };
    },
    async execute(args) {
      const attachedTools = bundleTools(allTools, args.bundles).map((tool) => tool.name);
      return {
        ok: true,
        data: {
          attachedBundles: args.bundles,
          attachedTools,
          message:
            attachedTools.length > 0
              ? "These tools are attached for your next step."
              : "None of those tools are available in this chat.",
        },
      };
    },
  };
}

/** runAgent resolveToolBundles hook: the schemas a request_adminmate_tools call asked for. */
export function resolveAdminMateToolBundles(
  event: { toolName: string; input: unknown; isError: boolean },
  allTools: readonly CanonicalTool<unknown>[],
): CanonicalTool<unknown>[] {
  if (event.toolName !== "request_adminmate_tools" || event.isError) return [];
  const raw = event.input && typeof event.input === "object" && !Array.isArray(event.input)
    ? (event.input as Record<string, unknown>).bundles
    : null;
  const bundles = Array.isArray(raw) ? Array.from(new Set(raw.filter(isBundleName))) : [];
  return bundleTools(allTools, bundles);
}
