/**
 * Memory loader.
 *
 * Fetches the small slice of agent-memory + agent-soul that must be
 * present in every system prompt:
 *
 *   - All `agent-soul` rows. Soul is small by design (≤ 20 rows) and
 *     describes how to communicate with the team — needed every turn.
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

export interface PinnedMemoryBlock {
  /** Markdown-ish text, or empty string if there's nothing to inject. */
  text: string;
}

export interface MemoryTokenUsage {
  /** Pinned facts section text (importance ≥ 80, capped), or "". */
  memoryText: string;
  /** Soul section text (all aspects), or "". */
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
): Promise<PinnedMemoryBlock> {
  const usage = await computeMemoryTokenUsage(clientIds);
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
): Promise<MemoryTokenUsage> {
  const cfg = await payloadConfig;
  const payload = await getPayload({ config: cfg });

  let memoryText = "";
  let soulText = "";
  let pinnedFactCount = 0;
  let soulAspectCount = 0;

  // ── Pinned facts ──
  try {
    const where: Record<string, unknown> = {
      and: [
        { importance: { greater_than_equal: PINNED_IMPORTANCE_THRESHOLD } },
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
        "Pinned facts loaded from memory. Use `memory_search` if you need more, " +
        "and `remember` when you learn something new worth keeping.\n\n" +
        lines.join("\n");
    }
  } catch (err) {
    // Non-fatal: agent runs without pinned memory if the lookup blows up.
    console.warn("[memory-loader] pinned facts lookup failed:", (err as Error).message);
  }

  // ── Soul (always full) ──
  try {
    const soul = await payload.find({
      collection: "agent-soul" as never,
      limit: 50, // safety cap; design target is ≤ 20
      sort: "aspect",
      overrideAccess: true,
      depth: 0,
    });
    if (soul.docs.length > 0) {
      soulAspectCount = soul.docs.length;
      const lines = (soul.docs as unknown as Array<{
        aspect: string;
        content: string;
      }>).map((s) => `- **${s.aspect}**: ${s.content}`);
      soulText =
        "## Working with this team\n\n" +
        "Communication lessons. Use `soul_set` if the user corrects how you " +
        "communicate.\n\n" +
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
