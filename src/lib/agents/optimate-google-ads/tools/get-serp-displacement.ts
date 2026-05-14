/**
 * Tool: get_serp_displacement
 *
 * Reads the latest SERP-displacement snapshots for the linked client straight
 * from the `serp-displacement-snapshots` collection (Growth Tools' daily
 * tracker writes them in). Lazy-loaded — the agent only calls this when the
 * user explicitly asks about SERP layout, AI Overview presence, or paid
 * displacement.
 *
 * Returns the most recent snapshot per (keyword, location, device) tracked,
 * defaulting to LAST_7_DAYS so a quiet weekend still has data to talk about.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { getPayload } from "payload";
import payloadConfig from "@/payload.config";
import { SUPPORTED_PRESETS, resolveRange } from "./_date-range";
import { rangeToDates } from "./_client-tokens";

interface GetSerpDisplacementArgs {
  range?: string;
  keywords?: string[];
}

interface SnapshotRow {
  id: number;
  keyword: string;
  location: string;
  device: "desktop" | "mobile";
  capturedAt: string;
  hasAiOverview: boolean;
  aiOverviewExpanded?: boolean | null;
  aiOverviewCitesDomain?: boolean | null;
  hasAnswerBox: boolean;
  hasKnowledgeGraph: boolean;
  hasShopping: boolean;
  hasLocalPack: boolean;
  topAdCount: number;
  bottomAdCount: number;
  organicPosition?: number | null;
  organicPixelOffset?: number | null;
  paidPosition?: number | null;
  paidAbsoluteTopIs?: number | null;
  paidTopIs?: number | null;
}

interface ClientSerpMonitorConfig {
  serpMonitor?: {
    enabled?: boolean | null;
    domain?: string | null;
    keywords?: Array<{ keyword?: string | null; location?: string | null }> | null;
  } | null;
}

export const getSerpDisplacement: CanonicalTool<GetSerpDisplacementArgs> = {
  name: "get_serp_displacement",
  description:
    "Read the latest SERP Displacement snapshots for the linked client (AI Overview presence + cites, organic position, paid position, sponsored ad count, SERP features). Default range LAST_7_DAYS. Pass `keywords` to filter to specific tracked terms. Requires the client to have SERP Monitor enabled.",
  inputSchema: {
    type: "object",
    properties: {
      range: {
        type: "string",
        description:
          "Date range preset for `capturedAt`. Default LAST_7_DAYS. Supported: " +
          (SUPPORTED_PRESETS as readonly string[]).join(", "),
      },
      keywords: {
        type: "array",
        items: { type: "string" },
        description: "Optional. Filter to these keywords (case-insensitive). Omit to return all monitored keywords.",
      },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const out: GetSerpDisplacementArgs = {};
    if (obj.range !== undefined && obj.range !== null) out.range = String(obj.range);
    if (Array.isArray(obj.keywords)) {
      out.keywords = obj.keywords
        .map((k) => (typeof k === "string" ? k.trim() : ""))
        .filter((k) => k.length > 0);
    }
    return out;
  },
  execute: async (args, ctx) => {
    const clientId = ctx.context.clientId as number | string | undefined;
    if (clientId === undefined || clientId === null) {
      return { ok: false, error: "No linked client; SERP Monitor data is per-client." };
    }

    const cfg = await payloadConfig;
    const payload = await getPayload({ config: cfg });

    // Check the client's SERP Monitor configuration so we can give a useful
    // "not enabled" answer instead of an empty list.
    let clientDoc: ClientSerpMonitorConfig | null = null;
    try {
      clientDoc = (await payload.findByID({
        collection: "clients",
        id: clientId as never,
        depth: 0,
        overrideAccess: true,
      })) as unknown as ClientSerpMonitorConfig;
    } catch {
      return { ok: false, error: `Client ${clientId} not found.` };
    }

    const monitor = clientDoc?.serpMonitor;
    if (!monitor?.enabled) {
      return {
        ok: true,
        data: {
          enabled: false,
          reason:
            "SERP Monitor is not enabled for this client. Enable it on the client's SERP Monitor tab and add tracked keywords before snapshots will start.",
        },
      };
    }

    const trackedKeywords =
      Array.isArray(monitor.keywords) && monitor.keywords.length > 0
        ? monitor.keywords
            .map((k) => (k?.keyword ? String(k.keyword).trim() : ""))
            .filter(Boolean)
        : [];

    const resolved = resolveRange(args.range ?? "LAST_7_DAYS");
    const { startDate, endDate } = rangeToDates(resolved.dateRange);
    // capturedAt is a Date field — compare against ISO timestamps spanning the
    // full day. End date is the END of endDate (23:59:59.999) so today's snapshot
    // is included even for the LAST_7_DAYS range that ends "yesterday".
    const startIso = `${startDate}T00:00:00.000Z`;
    const endIso = `${endDate}T23:59:59.999Z`;

    const where: Record<string, unknown> = {
      client: { equals: clientId },
      capturedAt: { greater_than_equal: startIso, less_than_equal: endIso },
    };

    if (args.keywords && args.keywords.length > 0) {
      where.keyword = { in: args.keywords };
    }

    let result;
    try {
      result = await payload.find({
        collection: "serp-displacement-snapshots" as never,
        where: where as never,
        limit: 200,
        sort: "-capturedAt",
        overrideAccess: true,
        depth: 0,
      });
    } catch (err) {
      return {
        ok: false,
        error: `Failed to read SERP snapshots: ${(err as Error).message}`,
      };
    }

    const docs = result.docs as unknown as SnapshotRow[];

    // Reduce to one row per (keyword, location, device) — the most recent.
    const latestByKey = new Map<string, SnapshotRow>();
    for (const doc of docs) {
      const key = `${doc.keyword}|${doc.location}|${doc.device}`;
      const existing = latestByKey.get(key);
      if (!existing || new Date(doc.capturedAt).getTime() > new Date(existing.capturedAt).getTime()) {
        latestByKey.set(key, doc);
      }
    }

    const latest = Array.from(latestByKey.values()).sort((a, b) =>
      a.keyword.localeCompare(b.keyword) || a.location.localeCompare(b.location),
    );

    return {
      ok: true,
      data: {
        enabled: true,
        domain: monitor.domain ?? null,
        period: { startDate, endDate, rangeLabel: resolved.label },
        trackedKeywordCount: trackedKeywords.length,
        snapshotCount: latest.length,
        snapshots: latest.map((s) => ({
          keyword: s.keyword,
          location: s.location,
          device: s.device,
          capturedAt: s.capturedAt,
          aiOverview: {
            present: s.hasAiOverview,
            expanded: s.aiOverviewExpanded ?? null,
            citesDomain: s.aiOverviewCitesDomain ?? null,
          },
          serpFeatures: {
            answerBox: s.hasAnswerBox,
            knowledgeGraph: s.hasKnowledgeGraph,
            shopping: s.hasShopping,
            localPack: s.hasLocalPack,
          },
          ads: {
            top: s.topAdCount,
            bottom: s.bottomAdCount,
          },
          organic: {
            position: s.organicPosition ?? null,
            pixelOffset: s.organicPixelOffset ?? null,
          },
          paid: {
            position: s.paidPosition ?? null,
            absoluteTopImpressionShare: s.paidAbsoluteTopIs ?? null,
            topImpressionShare: s.paidTopIs ?? null,
          },
        })),
      },
    };
  },
};
