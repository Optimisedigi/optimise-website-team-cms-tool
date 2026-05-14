/**
 * Tool: get_ai_visibility
 *
 * Returns the most recent AI Visibility snapshot for the linked client —
 * weekly GA4 referral traffic from ChatGPT / Perplexity / Gemini / Claude /
 * Copilot etc. Lazy-loaded; the agent calls this only when the user asks
 * about AI assistant traffic.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { getPayload } from "payload";
import payloadConfig from "@/payload.config";

interface GetAiVisibilityArgs {
  /** How many recent snapshots to return. Default 1 (the latest). Max 12. */
  recent?: number;
}

interface BySourceRow {
  source?: string;
  assistant?: string;
  sessions?: number;
  users?: number;
  conversions?: number;
  conversionValue?: number;
  engagedSessions?: number;
  topLandingPages?: Array<{ path?: string; sessions?: number; conversions?: number }>;
}

interface AiVisibilitySnapshotRow {
  id: number;
  propertyId: string;
  periodStart: string;
  periodEnd: string;
  totalSessions: number;
  totalUsers: number;
  totalConversions: number;
  conversionValue?: number | null;
  engagedSessions?: number | null;
  avgEngagementTime?: number | null;
  bySource?: BySourceRow[] | null;
  shareBySource?: Record<string, number> | null;
  fetchedAt: string;
}

interface ClientAiVisibilityConfig {
  aiVisibility?: {
    enabled?: boolean | null;
  } | null;
}

export const getAiVisibility: CanonicalTool<GetAiVisibilityArgs> = {
  name: "get_ai_visibility",
  description:
    "Read the latest AI Visibility snapshot(s) for the linked client — weekly GA4 traffic + conversions from AI assistants (ChatGPT, Perplexity, Gemini, Claude, Copilot, etc.). Default returns the most recent 1 snapshot. Pass `recent` (max 12) to compare across weeks. Requires the client to have AI Visibility enabled.",
  inputSchema: {
    type: "object",
    properties: {
      recent: {
        type: "number",
        description: "How many recent snapshots to return. Default 1, max 12.",
      },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const out: GetAiVisibilityArgs = {};
    if (typeof obj.recent === "number" && Number.isFinite(obj.recent)) {
      out.recent = Math.max(1, Math.min(12, Math.floor(obj.recent)));
    }
    return out;
  },
  execute: async (args, ctx) => {
    const clientId = ctx.context.clientId as number | string | undefined;
    if (clientId === undefined || clientId === null) {
      return { ok: false, error: "No linked client; AI Visibility data is per-client." };
    }

    const cfg = await payloadConfig;
    const payload = await getPayload({ config: cfg });

    let clientDoc: ClientAiVisibilityConfig | null = null;
    try {
      clientDoc = (await payload.findByID({
        collection: "clients",
        id: clientId as never,
        depth: 0,
        overrideAccess: true,
      })) as unknown as ClientAiVisibilityConfig;
    } catch {
      return { ok: false, error: `Client ${clientId} not found.` };
    }

    if (!clientDoc?.aiVisibility?.enabled) {
      return {
        ok: true,
        data: {
          enabled: false,
          reason:
            "AI Visibility is not enabled for this client. Enable it on the client's AI Visibility tab to start collecting weekly snapshots.",
        },
      };
    }

    let result;
    try {
      result = await payload.find({
        collection: "ai-visibility-snapshots" as never,
        where: { client: { equals: clientId } } as never,
        limit: args.recent ?? 1,
        sort: "-periodEnd",
        overrideAccess: true,
        depth: 0,
      });
    } catch (err) {
      return {
        ok: false,
        error: `Failed to read AI Visibility snapshots: ${(err as Error).message}`,
      };
    }

    const docs = result.docs as unknown as AiVisibilitySnapshotRow[];

    if (docs.length === 0) {
      return {
        ok: true,
        data: {
          enabled: true,
          snapshotCount: 0,
          reason:
            "AI Visibility is enabled but no snapshots have been collected yet. The weekly GA4 pull may not have run.",
        },
      };
    }

    return {
      ok: true,
      data: {
        enabled: true,
        snapshotCount: docs.length,
        snapshots: docs.map((s) => ({
          periodStart: s.periodStart,
          periodEnd: s.periodEnd,
          fetchedAt: s.fetchedAt,
          propertyId: s.propertyId,
          totals: {
            sessions: s.totalSessions,
            users: s.totalUsers,
            conversions: s.totalConversions,
            conversionValue: s.conversionValue ?? 0,
            engagedSessions: s.engagedSessions ?? 0,
            avgEngagementTime: s.avgEngagementTime ?? 0,
          },
          shareBySource: s.shareBySource ?? null,
          bySource: Array.isArray(s.bySource)
            ? s.bySource.map((row) => ({
                source: row.source ?? null,
                assistant: row.assistant ?? null,
                sessions: row.sessions ?? 0,
                users: row.users ?? 0,
                conversions: row.conversions ?? 0,
                conversionValue: row.conversionValue ?? 0,
                engagedSessions: row.engagedSessions ?? 0,
                topLandingPages: Array.isArray(row.topLandingPages)
                  ? row.topLandingPages.slice(0, 5).map((p) => ({
                      path: p.path ?? null,
                      sessions: p.sessions ?? 0,
                      conversions: p.conversions ?? 0,
                    }))
                  : [],
              }))
            : [],
        })),
      },
    };
  },
};
