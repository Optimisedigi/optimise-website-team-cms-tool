/**
 * Tool: memory_search
 *
 * Reads facts from agent-memory. Three modes:
 *   - scope='client' + clientId → all facts for that client (optionally
 *     filtered by query against subject + content)
 *   - scope='global' → all global facts (optionally query-filtered)
 *   - no scope → both, query-matched
 *
 * Stamps `lastAccessedAt` on every returned row so we can prune cold rows
 * later. Default limit 10 to keep responses tight; the agent can raise it
 * if needed.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { getPayload } from "payload";
import payloadConfig from "@/payload.config";

interface MemorySearchArgs {
  scope?: "client" | "global";
  clientId?: number | string;
  query?: string;
  limit?: number;
}

interface MemoryRow {
  id: number;
  scope: "client" | "global";
  client?: number | { id: number } | null;
  category: string;
  subject: string;
  content: string;
  importance: number;
  updatedAt: string;
}

export const memorySearch: CanonicalTool<MemorySearchArgs> = {
  name: "memory_search",
  description:
    "Search saved facts before asking a question you might already know the answer to. Returns up to 10 rows ranked by importance then recency. If scope is omitted, searches both client and global facts; in a client-scoped chat the active clientId is used automatically.",
  inputSchema: {
    type: "object",
    properties: {
      scope: {
        type: "string",
        enum: ["client", "global"],
        description: "Restrict to one scope. Omit to search both.",
      },
      clientId: {
        type: ["number", "string"],
        description:
          "Override the client filter for client-scoped search. Defaults to the chat's active client.",
      },
      query: {
        type: "string",
        description:
          "Substring to match against subject + content (case-insensitive). Omit to list all facts in scope.",
      },
      limit: {
        type: "number",
        description: "Max rows to return. Default 10, max 50.",
      },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") return {};
    const obj = raw as Record<string, unknown>;
    const scope =
      obj.scope === "client" || obj.scope === "global" ? obj.scope : undefined;
    const clientId =
      typeof obj.clientId === "number" || typeof obj.clientId === "string"
        ? obj.clientId
        : undefined;
    const query = typeof obj.query === "string" ? obj.query.trim() : undefined;
    const limitRaw = typeof obj.limit === "number" ? obj.limit : 10;
    const limit = Math.max(1, Math.min(50, Math.round(limitRaw)));
    return { scope, clientId, query, limit };
  },
  execute: async (args, ctx) => {
    const cfg = await payloadConfig;
    const payload = await getPayload({ config: cfg });

    const ctxClientId = ctx.context.clientId as number | string | undefined;
    const effectiveClientId = args.clientId ?? ctxClientId;

    // Build the where. Scope filter + optional client filter + optional
    // query filter. Payload's where doesn't support OR-of-LIKE on multiple
    // text fields cleanly across drivers, so we union via Payload's `or`.
    // Build scope filter as a fresh value (no aliasing) so we can safely
    // wrap with an outer AND for the query filter without creating a
    // circular reference.
    const scopeBlocks: Array<Record<string, unknown>> = [];
    if (args.scope === "client" || (!args.scope && effectiveClientId !== undefined)) {
      const block: Record<string, unknown> = { scope: { equals: "client" } };
      if (effectiveClientId !== undefined) {
        block.client = { equals: effectiveClientId };
      }
      scopeBlocks.push({ and: [block] });
    }
    if (args.scope === "global" || !args.scope) {
      scopeBlocks.push({ and: [{ scope: { equals: "global" } }] });
    }
    const scopeWhere: Record<string, unknown> =
      scopeBlocks.length === 1 ? scopeBlocks[0] : { or: scopeBlocks };

    const where: Record<string, unknown> =
      args.query && args.query.length > 0
        ? {
            and: [
              scopeWhere,
              {
                or: [
                  { subject: { contains: args.query } },
                  { content: { contains: args.query } },
                  { category: { contains: args.query } },
                ],
              },
            ],
          }
        : scopeWhere;

    let result;
    try {
      result = await payload.find({
        collection: "agent-memory" as never,
        where: where as never,
        limit: args.limit ?? 10,
        // Payload sort can't combine importance DESC with a date desc in one
        // expression cleanly; ranking by importance is the dominant signal,
        // ties broken by recency. Use createdAt for stable ordering.
        sort: "-importance,-updatedAt",
        overrideAccess: true,
        depth: 0,
      });
    } catch (err) {
      return { ok: false, error: `memory_search: query failed: ${(err as Error).message}` };
    }

    const rows = result.docs as unknown as MemoryRow[];

    // Stamp lastAccessedAt on returned rows. Best-effort, parallel, never
    // blocks the response — failures are logged but ignored.
    if (rows.length > 0) {
      const now = new Date().toISOString();
      // Defensive Promise.resolve wrap: some Payload versions / mocks return
      // undefined synchronously, which would explode the .catch() chain.
      Promise.all(
        rows.map((r) =>
          Promise.resolve(
            payload.update({
              collection: "agent-memory" as never,
              id: r.id,
              data: { lastAccessedAt: now } as never,
              overrideAccess: true,
            }),
          ).catch((err) => {
            ctx.log("memory_search.touch_failed", { id: r.id, err: (err as Error).message });
          }),
        ),
      ).catch(() => {});
    }

    const facts = rows.map((r) => ({
      id: r.id,
      scope: r.scope,
      clientId:
        typeof r.client === "object" && r.client !== null
          ? r.client.id
          : (r.client ?? null),
      category: r.category,
      subject: r.subject,
      content: r.content,
      importance: r.importance,
    }));

    return {
      ok: true,
      data: {
        count: facts.length,
        facts,
      },
    };
  },
};
