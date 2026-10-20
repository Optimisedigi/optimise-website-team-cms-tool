import { getPayload } from "payload";
import payloadConfig from "@/payload.config";
import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { changePreviewDb, createChangePreview, type ChangePreviewDb } from "../change-previews";
import { ensureCustomerId } from "./_growth-tools";

const GOOGLE_ADS_ACTIONS = [
  "campaign_status_update",
  "ad_group_status_update",
  "budget_update",
  "budget_push",
  "keyword_add",
  "keyword_pause",
  "negative_keyword_add",
  "ad_group_create",
  "campaign_create",
  "campaign_build",
  "campaign_restructure",
  "geo_campaign_split",
  "recommendation_apply",
  "ad_copy_deploy",
  "ad_extension_create",
  "ad_extension_sync",
  "ad_extension_assign",
  "ad_extension_delete",
  "growth_tools_request",
] as const;

type GoogleAdsActionType = (typeof GOOGLE_ADS_ACTIONS)[number];

interface ExecuteGoogleAdsActionArgs {
  action: GoogleAdsActionType;
  payload: Record<string, unknown>;
  summary?: string;
}

const GOOGLE_ADS_ACTION_ENDPOINTS: Partial<Record<GoogleAdsActionType, { method: "POST"; path: string }>> = {
  campaign_status_update: { method: "POST", path: "/api/google-ads/campaigns/status" },
  ad_group_status_update: { method: "POST", path: "/api/google-ads/ad-groups/pause" },
  budget_update: { method: "POST", path: "/api/google-ads/campaign-budgets/update" },
  budget_push: { method: "POST", path: "/api/google-ads/campaign-budgets/push" },
  keyword_pause: { method: "POST", path: "/api/google-ads/keywords/pause" },
  negative_keyword_add: { method: "POST", path: "/api/google-ads/negative-sweep/apply" },
  ad_group_create: { method: "POST", path: "/api/google-ads/ad-groups/create" },
  campaign_create: { method: "POST", path: "/api/google-ads/campaign-builder/cms" },
  campaign_build: { method: "POST", path: "/api/google-ads/campaign-builder/cms" },
  campaign_restructure: { method: "POST", path: "/api/google-ads/campaign-proposal/cms" },
  geo_campaign_split: { method: "POST", path: "/api/google-ads/geo-split/apply" },
  recommendation_apply: { method: "POST", path: "/api/google-ads/recommendations/apply" },
  ad_copy_deploy: { method: "POST", path: "/api/google-ads/deploy-ad-copy/cms" },
  ad_extension_create: { method: "POST", path: "/api/google-ads/ad-extensions/create" },
  ad_extension_sync: { method: "POST", path: "/api/google-ads/ad-extensions/sync" },
  ad_extension_assign: { method: "POST", path: "/api/google-ads/ad-extensions/assign" },
  ad_extension_delete: { method: "POST", path: "/api/google-ads/ad-extensions/delete" },
};

function isGoogleAdsAction(value: string): value is GoogleAdsActionType {
  return (GOOGLE_ADS_ACTIONS as readonly string[]).includes(value);
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function resolveEndpoint(action: GoogleAdsActionType, payload: Record<string, unknown>): { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; path: string } {
  if (action === "keyword_add") {
    const adGroupId = String(payload.adGroupId ?? "").trim();
    if (!adGroupId) throw new Error("payload.adGroupId is required for keyword_add");
    return { method: "POST", path: `/api/google-ads/ad-groups/${encodeURIComponent(adGroupId)}/keywords/add` };
  }
  if (action === "growth_tools_request") {
    const path = String(payload.path ?? payload.endpointPath ?? "").trim();
    if (!path.startsWith("/api/google-ads/")) {
      throw new Error("growth_tools_request path must start with /api/google-ads/");
    }
    const method = String(payload.method ?? "POST").toUpperCase();
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      throw new Error("growth_tools_request method must be GET, POST, PUT, PATCH, or DELETE");
    }
    return { method: method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path };
  }
  const endpoint = GOOGLE_ADS_ACTION_ENDPOINTS[action];
  if (!endpoint) throw new Error(`No Growth Tools endpoint mapped for ${action}`);
  return endpoint;
}

function actionPayload(action: GoogleAdsActionType, payload: Record<string, unknown>): Record<string, unknown> {
  if (action !== "growth_tools_request") return payload;
  const { method: _method, path: _path, endpointPath: _endpointPath, body, ...rest } = payload;
  return assertObject(body ?? rest, "payload.body");
}

function appendQuery(path: string, params: Record<string, unknown>): string {
  const [base, existing = ""] = path.split("?", 2);
  const qs = new URLSearchParams(existing);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || typeof value === "object") continue;
    qs.set(key, String(value));
  }
  const query = qs.toString();
  return query ? `${base}?${query}` : base;
}

function optionalId(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

async function defaultPreviewDb(): Promise<ChangePreviewDb> {
  return changePreviewDb(await getPayload({ config: await payloadConfig }));
}

/**
 * Builds the tool. `openDb` is injectable so tests can use an in-memory
 * database; production opens the Payload database.
 */
export function createExecuteGoogleAdsActionTool(
  openDb: () => Promise<ChangePreviewDb> = defaultPreviewDb,
  now: () => Date = () => new Date(),
): CanonicalTool<ExecuteGoogleAdsActionArgs> {
  return {
    name: "execute_google_ads_action",
    description:
      "Prepare a live Google Ads change through Growth Tools for the selected client. This does NOT change the account: it saves the exact request as a preview and shows the user a change card with Apply live and Cancel buttons. The change only happens when the user taps Apply live. Uses the selected client customerId from agent context, never a manually supplied customer ID. Use mapped actions for common writes, or growth_tools_request for any existing Growth Tools /api/google-ads/* endpoint. Use only when the user directly asks to create, update, pause, enable, apply, push, deploy, or otherwise make a live Google Ads change.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: [...GOOGLE_ADS_ACTIONS] },
        payload: {
          type: "object",
          description: "Action-specific payload, excluding customerId/clientId/auditId/userId metadata because the tool injects those from context. For growth_tools_request, include method, path, and optional body for any /api/google-ads/* Growth Tools endpoint.",
          additionalProperties: true,
        },
        summary: { type: "string", maxLength: 500 },
      },
      required: ["action", "payload"],
      additionalProperties: false,
    },
    // Each call stores a preview row; identical repeats in one run reuse the first.
    sideEffect: true,
    validate(raw) {
      const obj = assertObject(raw, "input");
      const action = String(obj.action ?? "").trim();
      if (!isGoogleAdsAction(action)) throw new Error(`Unsupported Google Ads action: ${action}`);
      const payload = assertObject(obj.payload, "payload");
      return {
        action,
        payload,
        ...(typeof obj.summary === "string" && obj.summary.trim() ? { summary: obj.summary.trim() } : {}),
      };
    },
    async execute(args, ctx) {
      let customerId: string;
      try {
        customerId = ensureCustomerId(ctx.context.customerId);
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
      const ownerId = optionalId(ctx.context.userId);
      if (ownerId === undefined) {
        return { ok: false, error: "Live Google Ads changes need a signed-in user to review and apply them." };
      }

      let endpoint: ReturnType<typeof resolveEndpoint>;
      let payload: Record<string, unknown>;
      try {
        endpoint = resolveEndpoint(args.action, args.payload);
        payload = actionPayload(args.action, args.payload);
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }

      const clientId = optionalId(ctx.context.clientId);
      const auditId = optionalId(ctx.context.auditId);
      // Same body growthToolsRequest would send, metadata included, so the
      // stored request is exactly what Apply live sends.
      const requestBody: Record<string, unknown> = {
        ...payload,
        customerId,
        action: args.action,
        ...(args.summary ? { summary: args.summary } : {}),
        agentRunId: ctx.agentRunId,
        ...(clientId !== undefined ? { clientId } : {}),
        ...(auditId !== undefined ? { auditId } : {}),
        userId: ownerId,
        source: "optimax",
      };
      const isGet = endpoint.method === "GET";

      let preview: { id: number; expiresAt: string };
      try {
        preview = await createChangePreview(await openDb(), {
          ownerId,
          customerId,
          ...(auditId !== undefined ? { auditId } : {}),
          ...(clientId !== undefined ? { clientId } : {}),
          agentRunId: ctx.agentRunId,
          action: args.action,
          method: endpoint.method,
          path: isGet ? appendQuery(endpoint.path, requestBody) : endpoint.path,
          ...(isGet ? {} : { requestBody }),
          ...(args.summary ? { summary: args.summary } : {}),
          now: now(),
        });
      } catch (err) {
        return { ok: false, error: `Could not save the change preview: ${(err as Error).message}` };
      }

      return {
        ok: true,
        data: {
          previewed: true,
          applied: false,
          changeId: preview.id,
          action: args.action,
          endpoint: endpoint.path,
          expiresAt: preview.expiresAt,
          nextStep:
            "Nothing has changed in Google Ads yet. Tell the user the change is ready in the change card and that they need to tap Apply live to make it live (or Cancel). Do not say it is live or applied.",
        },
      };
    },
  };
}

export const executeGoogleAdsAction = createExecuteGoogleAdsActionTool();
