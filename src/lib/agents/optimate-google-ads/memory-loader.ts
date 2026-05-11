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

const PINNED_IMPORTANCE_THRESHOLD = 80;
const PINNED_FACT_LIMIT = 10;

export interface PinnedMemoryBlock {
  /** Markdown-ish text, or empty string if there's nothing to inject. */
  text: string;
}

/**
 * Build the "## Known about this account" + "## Working with this user"
 * sections appended to the system prompt. `clientIds` is the union of
 * clients in the chat; pass an empty array for an unscoped chat.
 */
export async function loadPinnedMemoryBlock(
  clientIds: Array<string | number>,
): Promise<PinnedMemoryBlock> {
  const cfg = await payloadConfig;
  const payload = await getPayload({ config: cfg });

  const sections: string[] = [];

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
      sections.push(
        "## Known about this account\n\n" +
          "Pinned facts loaded from memory. Use `memory_search` if you need more, " +
          "and `remember` when you learn something new worth keeping.\n\n" +
          lines.join("\n"),
      );
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
      const lines = (soul.docs as unknown as Array<{
        aspect: string;
        content: string;
      }>).map((s) => `- **${s.aspect}**: ${s.content}`);
      sections.push(
        "## Working with this team\n\n" +
          "Communication lessons. Use `soul_set` if the user corrects how you " +
          "communicate.\n\n" +
          lines.join("\n"),
      );
    }
  } catch (err) {
    console.warn("[memory-loader] soul lookup failed:", (err as Error).message);
  }

  return { text: sections.length === 0 ? "" : sections.join("\n\n") };
}
