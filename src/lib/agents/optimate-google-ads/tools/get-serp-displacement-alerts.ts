/**
 * Tool: get_serp_displacement_alerts
 *
 * Returns recent SERP-displacement alerts (AIO appeared/lost, citations
 * gained/lost, organic drop, paid displaced) for the linked client. Lazy-
 * loaded — call when the user asks "anything change recently?" or
 * "what alerts do we have?".
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { getPayload } from "payload";
import payloadConfig from "@/payload.config";

interface GetSerpDisplacementAlertsArgs {
  limit?: number;
  severity?: Array<"info" | "warning" | "critical">;
}

type AlertType =
  | "ai_overview_appeared"
  | "ai_overview_lost"
  | "cited_in_aio"
  | "dropped_from_aio"
  | "organic_drop"
  | "paid_displaced";

interface AlertRow {
  id: number;
  keyword: string;
  alertType: AlertType;
  severity: "info" | "warning" | "critical";
  description: string;
  recommendedAction?: string | null;
  emailSent?: boolean | null;
  createdAt: string;
}

const VALID_SEVERITIES = new Set(["info", "warning", "critical"] as const);

export const getSerpDisplacementAlerts: CanonicalTool<GetSerpDisplacementAlertsArgs> = {
  name: "get_serp_displacement_alerts",
  description:
    "List recent SERP Displacement alerts for the linked client (AI Overview appeared/lost, organic drop, paid displaced, etc.). Use to answer 'what changed recently?'. Default limit 20, sorted newest first. Pass `severity` to filter (e.g. ['warning','critical']).",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Max alerts to return. Default 20, capped at 100.",
      },
      severity: {
        type: "array",
        items: { type: "string", enum: ["info", "warning", "critical"] },
        description: "Optional. Restrict to these severities.",
      },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const out: GetSerpDisplacementAlertsArgs = {};
    if (typeof obj.limit === "number" && Number.isFinite(obj.limit)) {
      out.limit = Math.max(1, Math.min(100, Math.floor(obj.limit)));
    }
    if (Array.isArray(obj.severity)) {
      const filtered = obj.severity
        .map((s) => (typeof s === "string" ? s.trim().toLowerCase() : ""))
        .filter((s): s is "info" | "warning" | "critical" =>
          VALID_SEVERITIES.has(s as "info" | "warning" | "critical"),
        );
      if (filtered.length > 0) out.severity = filtered;
    }
    return out;
  },
  execute: async (args, ctx) => {
    const clientId = ctx.context.clientId as number | string | undefined;
    if (clientId === undefined || clientId === null) {
      return { ok: false, error: "No linked client; SERP alerts are per-client." };
    }

    const cfg = await payloadConfig;
    const payload = await getPayload({ config: cfg });

    const where: Record<string, unknown> = { client: { equals: clientId } };
    if (args.severity && args.severity.length > 0) {
      where.severity = { in: args.severity };
    }

    let result;
    try {
      result = await payload.find({
        collection: "serp-displacement-alerts" as never,
        where: where as never,
        limit: args.limit ?? 20,
        sort: "-createdAt",
        overrideAccess: true,
        depth: 0,
      });
    } catch (err) {
      return {
        ok: false,
        error: `Failed to read SERP alerts: ${(err as Error).message}`,
      };
    }

    const docs = result.docs as unknown as AlertRow[];

    return {
      ok: true,
      data: {
        count: docs.length,
        alerts: docs.map((a) => ({
          id: a.id,
          keyword: a.keyword,
          alertType: a.alertType,
          severity: a.severity,
          description: a.description,
          recommendedAction: a.recommendedAction ?? null,
          createdAt: a.createdAt,
        })),
      },
    };
  },
};
