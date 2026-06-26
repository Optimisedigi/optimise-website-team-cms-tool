/**
 * Memory loader.
 *
 * Fetches the small slice of agent-memory + agent-soul that must be
 * present in every system prompt:
 *
 *   - `agent-soul` rows. By default this is all rows for backwards
 *     compatibility. Callers can pass `soulAgentKeys` to load rows scoped to
 *     "all" plus rows whose Applies to dropdown matches that agent.
 *   - The top-N `agent-memory` rows where importance ≥ 80 and either
 *     scope='global' OR client = active client. Capped to keep token
 *     budget tight (~10 rows × ~30 tokens = 300 tokens for memory; soul
 *     adds another ~600 if full).
 *
 * Everything else stays in the DB and only appears when the agent calls
 * `memory_search` — that's the whole point of this design.
 */

import { getPayload } from "payload";
import payloadConfig from "@/payload.config";
import { estimateTokens } from "@/lib/agents/_shared/token-estimate";

const PINNED_IMPORTANCE_THRESHOLD = 80;
const PINNED_FACT_LIMIT = 10;
const AGENT_SOUL_PREFIXES = ["google-ads", "email", "invoice", "invoicemate", "xero"] as const;

interface SoulRow {
  aspect: string;
  appliesTo?: string | null;
  content: string;
}

export interface PinnedMemoryBlock {
  /** Markdown-ish text, or empty string if there's nothing to inject. */
  text: string;
}

export interface MemoryLoadOptions {
  /**
   * When false, skip pinned memory facts and load only soul rules. Useful for
   * agents that should inherit communication style without account facts.
   */
  includePinnedFacts?: boolean;
  /**
   * When set, include global soul rows plus rows whose Applies to dropdown
   * matches one of these agent keys. Older prefix-based rows are still handled
   * as a fallback. When omitted, all soul rows are loaded to preserve existing
   * Google Ads prompt behaviour.
   */
  soulAgentKeys?: string[];
}

function filterSoulRows(rows: SoulRow[], soulAgentKeys?: string[]): SoulRow[] {
  if (!soulAgentKeys || soulAgentKeys.length === 0) return rows;

  const allowedAgents = new Set(soulAgentKeys.map((key) => key.toLowerCase()));
  const allowedPrefixes = new Set(soulAgentKeys.map((key) => `${key.toLowerCase()}-`));
  return rows.filter((row) => {
    const appliesTo = row.appliesTo?.toLowerCase();
    if (appliesTo) return appliesTo === "all" || allowedAgents.has(appliesTo);

    // Backwards-compatible fallback for rows created before the appliesTo field.
    const aspect = row.aspect.toLowerCase();
    const knownAgentSpecific = AGENT_SOUL_PREFIXES.some((prefix) => aspect.startsWith(`${prefix}-`));
    if (!knownAgentSpecific) return true;
    return Array.from(allowedPrefixes).some((prefix) => aspect.startsWith(prefix));
  });
}

export interface MemoryTokenUsage {
  /** Pinned facts section text (importance ≥ 80, capped), or "". */
  memoryText: string;
  /** Soul section text (all or filtered aspects), or "". */
  soulText: string;
  memoryTokens: number;
  soulTokens: number;
  /** memoryTokens + soulTokens — what the block adds per prompt. */
  totalTokens: number;
  /** Row counts behind each section, for the panel's detail line. */
  pinnedFactCount: number;
  soulAspectCount: number;
}

/**
 * Build the "## Known about this account" + "## Working with this user"
 * sections appended to the system prompt. `clientIds` is the union of
 * clients in the chat; pass an empty array for an unscoped chat.
 */
export async function loadPinnedMemoryBlock(
  clientIds: Array<string | number>,
  options: MemoryLoadOptions = {},
): Promise<PinnedMemoryBlock> {
  const usage = await computeMemoryTokenUsage(clientIds, options);
  const sections = [usage.memoryText, usage.soulText].filter((s) => s.length > 0);
  return { text: sections.length === 0 ? "" : sections.join("\n\n") };
}

/**
 * Build the memory + soul block AND its token breakdown in one pass. This is
 * the single source of truth for what the agent injects every prompt; both
 * loadPinnedMemoryBlock (runtime) and the token-usage API (CMS panel) call it,
 * so the displayed estimate always matches what's actually sent.
 */
export async function computeMemoryTokenUsage(
  clientIds: Array<string | number>,
  options: MemoryLoadOptions = {},
): Promise<MemoryTokenUsage> {
  const cfg = await payloadConfig;
  const payload = await getPayload({ config: cfg });

  let memoryText = "";
  let soulText = "";
  let pinnedFactCount = 0;
  let soulAspectCount = 0;

  // ── Pinned facts ──
  if (options.includePinnedFacts !== false) {
    try {
      const where: Record<string, unknown> = {
        and: [
          { importance: { greater_than_equal: PINNED_IMPORTANCE_THRESHOLD } },
          { or: [{ status: { equals: "active" } }, { status: { exists: false } }] },
          { or: [{ expiresAt: { greater_than: new Date().toISOString() } }, { expiresAt: { exists: false } }] },
          clientIds.length > 0
            ? {
                or: [
                  { scope: { equals: "global" } },
                  {
                    and: [
                      { scope: { equals: "client" } },
                      { client: { in: clientIds } },
                    ],
                  },
                ],
              }
            : { scope: { equals: "global" } },
        ],
      };
      const facts = await payload.find({
        collection: "agent-memory" as never,
        where: where as never,
        limit: PINNED_FACT_LIMIT,
        sort: "-importance,-updatedAt",
        overrideAccess: true,
        depth: 0,
      });
      if (facts.docs.length > 0) {
        pinnedFactCount = facts.docs.length;
        const lines = (facts.docs as unknown as Array<{
          scope: string;
          client?: number | { id: number } | null;
          category: string;
          subject: string;
          content: string;
        }>).map((f) => {
          const scopeTag =
            f.scope === "global"
              ? "[global]"
              : `[client ${typeof f.client === "object" && f.client ? f.client.id : f.client}]`;
          return `- ${scopeTag} **${f.subject}** (${f.category}): ${f.content}`;
        });
        memoryText =
          "## Known about this account\n\n" +
          "Pinned facts loaded from memory. More memory tools are attached only for explicit memory requests.\n\n" +
          lines.join("\n");
      }
    } catch (err) {
      // Non-fatal: agent runs without pinned memory if the lookup blows up.
      console.warn("[memory-loader] pinned facts lookup failed:", (err as Error).message);
    }
  }

  // ── Soul (full by default; optionally agent-filtered) ──
  try {
    const soul = await payload.find({
      collection: "agent-soul" as never,
      limit: 50, // safety cap; design target is ≤ 20
      sort: "aspect",
      overrideAccess: true,
      depth: 0,
    });
    if (soul.docs.length > 0) {
      const soulRows = filterSoulRows(
        soul.docs as unknown as SoulRow[],
        options.soulAgentKeys,
      );
      soulAspectCount = soulRows.length;
      const lines = soulRows.map((s) => `- **${s.aspect}**: ${s.content}`);
      soulText = lines.length === 0
        ? ""
        : "## Working with this team\n\n" +
          "Communication lessons loaded from soul. Soul update tools are attached only for explicit communication-style corrections.\n\n" +
          lines.join("\n");
    }
  } catch (err) {
    console.warn("[memory-loader] soul lookup failed:", (err as Error).message);
  }

  const memoryTokens = estimateTokens(memoryText);
  const soulTokens = estimateTokens(soulText);
  return {
    memoryText,
    soulText,
    memoryTokens,
    soulTokens,
    totalTokens: memoryTokens + soulTokens,
    pinnedFactCount,
    soulAspectCount,
  };
}
