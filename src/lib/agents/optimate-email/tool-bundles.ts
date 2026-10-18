/**
 * GmailMate text-chat tool loading.
 *
 * Production use (activity log, Jul to Oct 2026, 145 runs): stage_email_reply
 * ran in 90% of runs; summarize_email_thread, search_gmail_inbox,
 * read_gmail_message and create_gmail_draft ran in 1 to 3 runs each. So only
 * stage_email_reply is always sent. The others load when the user's own words
 * ask for them, or when the model calls request_email_tools. Voice mode keeps
 * every tool (getEmailRealtimeToolDefinitions).
 */

import type { CanonicalTool } from "../_shared/tool";

export const EMAIL_TOOL_BUNDLES = {
  gmail_read: ["summarize_email_thread", "search_gmail_inbox", "read_gmail_message"],
  gmail_save: ["create_gmail_draft"],
} as const satisfies Record<string, readonly string[]>;

export type EmailToolBundleName = keyof typeof EMAIL_TOOL_BUNDLES;

export const EMAIL_TOOL_BUNDLE_NAMES = Object.keys(EMAIL_TOOL_BUNDLES) as EmailToolBundleName[];

const ALWAYS_SENT: ReadonlySet<string> = new Set(["stage_email_reply", "remember", "memory_search"]);

function isBundleName(value: unknown): value is EmailToolBundleName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(EMAIL_TOOL_BUNDLES, value);
}

/**
 * Matched against the user's own typed messages only. Inbound email and
 * thread text is untrusted and full of words like "draft" and "inbox", so it
 * must not decide which tools load.
 */
const BUNDLE_PATTERNS: ReadonlyArray<readonly [EmailToolBundleName, RegExp]> = [
  ["gmail_read", /\b(search|find|look ?up|look for|inbox|read|open)\b|\bsummar|\bthread\b|\b(earlier|last|previous|other) (email|message)s?\b/],
  ["gmail_save", /\bsave\b|\bgmail\b|\bdrafts\b|\bdrafts? folder\b/],
];

export function detectEmailToolBundles(userTexts: readonly string[]): EmailToolBundleName[] {
  const text = userTexts.join("\n").toLowerCase();
  if (!text.trim()) return [];
  return BUNDLE_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([bundle]) => bundle);
}

/** stage_email_reply, memory tools when registered, and the named bundles. */
export function selectEmailTools(
  allTools: readonly CanonicalTool<unknown>[],
  bundles: readonly EmailToolBundleName[],
): CanonicalTool<unknown>[] {
  const wanted = new Set<string>(ALWAYS_SENT);
  for (const bundle of bundles) for (const name of EMAIL_TOOL_BUNDLES[bundle]) wanted.add(name);
  return allTools.filter((tool) => wanted.has(tool.name));
}

function bundleTools(
  allTools: readonly CanonicalTool<unknown>[],
  bundles: readonly EmailToolBundleName[],
): CanonicalTool<unknown>[] {
  const wanted = new Set<string>(bundles.flatMap((bundle) => [...EMAIL_TOOL_BUNDLES[bundle]]));
  return allTools.filter((tool) => wanted.has(tool.name));
}

const BUNDLE_SUMMARY = EMAIL_TOOL_BUNDLE_NAMES.map(
  (bundle) => `${bundle} (${EMAIL_TOOL_BUNDLES[bundle].join(", ")})`,
).join("; ");

/** Appended to the text-chat system prompt only; voice has every tool. */
export const EMAIL_TOOL_LOADING_NOTE =
  `\n\nTool loading: stage_email_reply is always available. Other tools load in bundles: ${BUNDLE_SUMMARY}. ` +
  "If a tool you need is not in your tool list, call request_email_tools with its bundle first, then use it.";

export function createEmailToolRequestTool(
  allTools: readonly CanonicalTool<unknown>[],
): CanonicalTool<{ bundles: EmailToolBundleName[] }> {
  return {
    name: "request_email_tools",
    description: `Attach GmailMate tools that are not in your tool list yet, before you use them. Bundles: ${BUNDLE_SUMMARY}.`,
    inputSchema: {
      type: "object",
      properties: {
        bundles: {
          type: "array",
          minItems: 1,
          items: { type: "string", enum: [...EMAIL_TOOL_BUNDLE_NAMES] },
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
        throw new Error(`At least one valid bundle is required: ${EMAIL_TOOL_BUNDLE_NAMES.join(", ")}.`);
      }
      return { bundles };
    },
    async execute(args) {
      return {
        ok: true,
        data: {
          attachedBundles: args.bundles,
          attachedTools: bundleTools(allTools, args.bundles).map((tool) => tool.name),
          message: "These tools are attached for your next step.",
        },
      };
    },
  };
}

/** runAgent resolveToolBundles hook for request_email_tools. */
export function resolveEmailToolBundles(
  event: { toolName: string; input: unknown; isError: boolean },
  allTools: readonly CanonicalTool<unknown>[],
): CanonicalTool<unknown>[] {
  if (event.toolName !== "request_email_tools" || event.isError) return [];
  const raw = event.input && typeof event.input === "object" && !Array.isArray(event.input)
    ? (event.input as Record<string, unknown>).bundles
    : null;
  const bundles = Array.isArray(raw) ? Array.from(new Set(raw.filter(isBundleName))) : [];
  return bundleTools(allTools, bundles);
}
