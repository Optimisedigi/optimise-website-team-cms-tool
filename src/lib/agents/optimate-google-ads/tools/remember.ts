/**
 * Tool: remember
 *
 * Writes a fact to agent-memory. Upserts by (scope, clientId, subject) so
 * the agent can re-call this with the same subject to refine an existing
 * fact rather than create duplicates.
 *
 * Modelled on Pocket Agent's `remember` — facts are not approval-queue
 * items because they don't touch live accounts; they're just notes.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { getPayload } from "payload";
import payloadConfig from "@/payload.config";

interface RememberArgs {
  scope: "client" | "global";
  clientId?: number | string;
  category: string;
  subject: string;
  content: string;
  importance?: number;
}

export const remember: CanonicalTool<RememberArgs> = {
  name: "remember",
  description:
    "Save a durable fact about a client account or the agency globally. Use when the user shares a preference, decision, constraint, or piece of history that's worth knowing in future chats. Don't save one-off questions or momentary context. Upserts by subject — re-call with the same subject to refine. Importance ≥ 80 makes the fact auto-load into the system prompt; default 50 leaves it search-only.",
  inputSchema: {
    type: "object",
    properties: {
      scope: {
        type: "string",
        enum: ["client", "global"],
        description:
          "'client' for facts about one client account (requires clientId). 'global' for agency-wide rules.",
      },
      clientId: {
        type: ["number", "string"],
        description: "Client ID. Required when scope = client. Use the clientId from the chat context.",
      },
      category: {
        type: "string",
        description:
          "Free-form bucket. Examples: preference, history, constraint, policy, decision.",
      },
      subject: {
        type: "string",
        description:
          "Short label, 3–5 words. De-dupe key within (scope, client). Example: 'PMax stance', 'approved Sept negatives'.",
      },
      content: {
        type: "string",
        description: "The fact, 1–3 sentences. Past tense for events, present tense for preferences.",
      },
      importance: {
        type: "number",
        description:
          "0–100. Default 50 (search-only). Use ≥ 80 only for facts that should auto-load into every chat for this client.",
      },
    },
    required: ["scope", "category", "subject", "content"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") {
      throw new Error("remember: missing args");
    }
    const obj = raw as Record<string, unknown>;
    const scope = obj.scope === "global" ? "global" : "client";
    const clientId =
      typeof obj.clientId === "number" || typeof obj.clientId === "string"
        ? obj.clientId
        : undefined;
    const category = typeof obj.category === "string" ? obj.category.trim() : "";
    const subject = typeof obj.subject === "string" ? obj.subject.trim() : "";
    const content = typeof obj.content === "string" ? obj.content.trim() : "";
    const importanceRaw = typeof obj.importance === "number" ? obj.importance : 50;
    const importance = Math.max(0, Math.min(100, Math.round(importanceRaw)));
    if (!category) throw new Error("remember: category is required");
    if (!subject) throw new Error("remember: subject is required");
    if (!content) throw new Error("remember: content is required");
    // clientId may be supplied via ctx.context.clientId when the chat is
    // already scoped to one client — don't require it here. The execute
    // path enforces it as the real guarantee.
    return { scope, clientId, category, subject, content, importance };
  },
  execute: async (args, ctx) => {
    const cfg = await payloadConfig;
    const payload = await getPayload({ config: cfg });

    // Resolve clientId from arg, otherwise fall back to the chat's
    // bound client (passed in run context). Keeps the tool ergonomic —
    // the agent doesn't have to repeat the client id every call.
    const ctxClientId = ctx.context.clientId as number | string | undefined;
    const clientId =
      args.scope === "client"
        ? args.clientId ?? ctxClientId
        : undefined;
    if (args.scope === "client" && clientId === undefined) {
      return {
        ok: false,
        error: "remember: scope=client requires clientId (none in chat context).",
      };
    }

    // Upsert by (scope, clientId, subject).
    const where: Record<string, unknown> =
      args.scope === "client"
        ? {
            and: [
              { scope: { equals: "client" } },
              { client: { equals: clientId } },
              { subject: { equals: args.subject } },
            ],
          }
        : {
            and: [
              { scope: { equals: "global" } },
              { subject: { equals: args.subject } },
            ],
          };

    let existingId: string | number | undefined;
    try {
      const found = await payload.find({
        collection: "agent-memory" as never,
        where: where as never,
        limit: 1,
        overrideAccess: true,
      });
      if (found.docs.length > 0) {
        existingId = (found.docs[0] as { id: string | number }).id;
      }
    } catch (err) {
      return { ok: false, error: `remember: lookup failed: ${(err as Error).message}` };
    }

    const userId = ctx.context.userId as number | undefined;

    try {
      if (existingId !== undefined) {
        const updated = await payload.update({
          collection: "agent-memory" as never,
          id: existingId,
          data: {
            category: args.category,
            content: args.content,
            importance: args.importance,
            status: "active",
            source: "agent-inferred",
            lastAccessedAt: new Date().toISOString(),
            agentRunId: ctx.agentRunId,
          } as never,
          overrideAccess: true,
        });
        ctx.log("memory.upsert", { action: "update", id: (updated as { id: unknown }).id, subject: args.subject });
        return {
          ok: true,
          data: {
            action: "updated",
            id: (updated as { id: unknown }).id,
            subject: args.subject,
            scope: args.scope,
          },
        };
      }

      const created = await payload.create({
        collection: "agent-memory" as never,
        data: {
          scope: args.scope,
          ...(args.scope === "client" ? { client: clientId } : {}),
          category: args.category,
          subject: args.subject,
          content: args.content,
          importance: args.importance,
          status: "active",
          source: "agent-inferred",
          confidence: 80,
          useCount: 0,
          lastAccessedAt: new Date().toISOString(),
          ...(userId !== undefined ? { createdBy: userId } : {}),
          agentRunId: ctx.agentRunId,
        } as never,
        overrideAccess: true,
      });
      ctx.log("memory.upsert", { action: "create", id: (created as { id: unknown }).id, subject: args.subject });
      return {
        ok: true,
        data: {
          action: "created",
          id: (created as { id: unknown }).id,
          subject: args.subject,
          scope: args.scope,
        },
      };
    } catch (err) {
      return { ok: false, error: `remember: write failed: ${(err as Error).message}` };
    }
  },
};
