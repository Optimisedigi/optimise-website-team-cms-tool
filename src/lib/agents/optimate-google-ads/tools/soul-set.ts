/**
 * Tool: soul_set
 *
 * Upserts one row in agent-soul. Soul is small by design (≤ 20 rows) and
 * always loaded into the system prompt — the agent uses this to record
 * lessons about *how* the user wants it to communicate, not facts about
 * clients (those go to `remember`).
 *
 * Examples of valid soul updates:
 *   aspect='tone', content='Be direct. State the answer first, then reasoning.'
 *   aspect='formatting', content='Always lead with the customer ID when discussing performance.'
 *   aspect='emoji', content='No emoji.'
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { getPayload } from "payload";
import payloadConfig from "@/payload.config";

interface SoulSetArgs {
  aspect: string;
  content: string;
}

export const soulSet: CanonicalTool<SoulSetArgs> = {
  name: "soul_set",
  description:
    "Record a lesson about HOW to communicate with the agency team. Use when the user corrects your communication style ('be more direct', 'no emoji', 'lead with the CID'). Do NOT use this for facts about clients — those go to `remember`. Upserts by aspect: re-call with the same aspect to update the lesson.",
  inputSchema: {
    type: "object",
    properties: {
      aspect: {
        type: "string",
        description:
          "Stable lowercase-kebab key. Examples: tone, formatting, pacing-style, emoji, brand-voice. Re-using an aspect overwrites the prior lesson.",
      },
      content: {
        type: "string",
        description:
          "The lesson, 1–3 sentences, imperative mood. Example: 'Be direct. No apologetic language. State the answer first, then the reasoning.'",
      },
    },
    required: ["aspect", "content"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") {
      throw new Error("soul_set: missing args");
    }
    const obj = raw as Record<string, unknown>;
    const aspect =
      typeof obj.aspect === "string" ? obj.aspect.trim().toLowerCase() : "";
    const content = typeof obj.content === "string" ? obj.content.trim() : "";
    if (!aspect) throw new Error("soul_set: aspect is required");
    if (!content) throw new Error("soul_set: content is required");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(aspect)) {
      throw new Error(
        "soul_set: aspect must be lowercase-kebab (a-z, 0-9, hyphens; no spaces).",
      );
    }
    return { aspect, content };
  },
  execute: async (args, ctx) => {
    const cfg = await payloadConfig;
    const payload = await getPayload({ config: cfg });

    let existingId: string | number | undefined;
    try {
      const found = await payload.find({
        collection: "agent-soul" as never,
        where: { aspect: { equals: args.aspect } } as never,
        limit: 1,
        overrideAccess: true,
      });
      if (found.docs.length > 0) {
        existingId = (found.docs[0] as { id: string | number }).id;
      }
    } catch (err) {
      return { ok: false, error: `soul_set: lookup failed: ${(err as Error).message}` };
    }

    try {
      if (existingId !== undefined) {
        await payload.update({
          collection: "agent-soul" as never,
          id: existingId,
          data: { content: args.content } as never,
          overrideAccess: true,
        });
        ctx.log("soul.upsert", { action: "update", aspect: args.aspect });
        return {
          ok: true,
          data: { action: "updated", aspect: args.aspect },
        };
      }
      await payload.create({
        collection: "agent-soul" as never,
        data: { aspect: args.aspect, content: args.content } as never,
        overrideAccess: true,
      });
      ctx.log("soul.upsert", { action: "create", aspect: args.aspect });
      return {
        ok: true,
        data: { action: "created", aspect: args.aspect },
      };
    } catch (err) {
      return { ok: false, error: `soul_set: write failed: ${(err as Error).message}` };
    }
  },
};
