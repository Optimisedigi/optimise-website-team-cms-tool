import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { growthToolsRequest } from "./_growth-tools";

const GTM_ACTIONS = [
  "workspace_create",
  "variable_create_or_update",
  "trigger_create_or_update",
  "tag_create_or_update",
  "version_create",
  "publish",
  "growth_tools_request",
] as const;

type GtmActionType = (typeof GTM_ACTIONS)[number];

interface ExecuteGtmActionArgs {
  action: GtmActionType;
  payload: Record<string, unknown>;
  summary?: string;
}

const GTM_ACTION_ENDPOINTS: Partial<Record<GtmActionType, { method: "POST"; path: string }>> = {
  workspace_create: { method: "POST", path: "/api/gtm/workspaces/create" },
  variable_create_or_update: { method: "POST", path: "/api/gtm/variables/create-or-update" },
  trigger_create_or_update: { method: "POST", path: "/api/gtm/triggers/create-or-update" },
  tag_create_or_update: { method: "POST", path: "/api/gtm/tags/create-or-update" },
  version_create: { method: "POST", path: "/api/gtm/versions/create" },
  publish: { method: "POST", path: "/api/gtm/versions/publish" },
};

function isGtmAction(value: string): value is GtmActionType {
  return (GTM_ACTIONS as readonly string[]).includes(value);
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function resolveEndpoint(action: GtmActionType, payload: Record<string, unknown>): { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; path: string } {
  if (action === "growth_tools_request") {
    const path = String(payload.path ?? payload.endpointPath ?? "").trim();
    if (!path.startsWith("/api/gtm/") && !path.startsWith("/api/tag-manager/")) {
      throw new Error("growth_tools_request path must start with /api/gtm/ or /api/tag-manager/");
    }
    const method = String(payload.method ?? "POST").toUpperCase();
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      throw new Error("growth_tools_request method must be GET, POST, PUT, PATCH, or DELETE");
    }
    return { method: method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path };
  }
  const endpoint = GTM_ACTION_ENDPOINTS[action];
  if (!endpoint) throw new Error(`No Growth Tools endpoint mapped for ${action}`);
  return endpoint;
}

function actionPayload(action: GtmActionType, payload: Record<string, unknown>): Record<string, unknown> {
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

export const executeGtmAction: CanonicalTool<ExecuteGtmActionArgs> = {
  name: "execute_gtm_action",
  description:
    "Execute a Google Tag Manager change through Growth Tools for the selected client, including workspace, variable, trigger, tag, version, and publish actions. Uses gtmContainerId from selected client context. Use growth_tools_request for any existing Growth Tools /api/gtm/* or /api/tag-manager/* endpoint.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: [...GTM_ACTIONS] },
      payload: { type: "object", description: "Action payload. For growth_tools_request, include method, path, and optional body.", additionalProperties: true },
      summary: { type: "string", maxLength: 500 },
    },
    required: ["action", "payload"],
    additionalProperties: false,
  },
  validate(raw) {
    const obj = assertObject(raw, "input");
    const action = String(obj.action ?? "").trim();
    if (!isGtmAction(action)) throw new Error(`Unsupported GTM action: ${action}`);
    return {
      action,
      payload: assertObject(obj.payload, "payload"),
      ...(typeof obj.summary === "string" && obj.summary.trim() ? { summary: obj.summary.trim() } : {}),
    };
  },
  async execute(args, ctx) {
    const gtmContainerId = String(ctx.context.gtmContainerId ?? "").trim();
    if (!gtmContainerId) {
      return { ok: false, error: "Selected client has no gtmContainerId. Add or discover the GTM container before running GTM actions." };
    }

    let endpoint: ReturnType<typeof resolveEndpoint>;
    let payload: Record<string, unknown>;
    try {
      endpoint = resolveEndpoint(args.action, args.payload);
      payload = actionPayload(args.action, args.payload);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    const requestBody = {
      ...payload,
      action: args.action,
      containerId: gtmContainerId,
      ...(args.summary ? { summary: args.summary } : {}),
    };
    const result = await growthToolsRequest<unknown>({
      method: endpoint.method,
      path: endpoint.method === "GET" ? appendQuery(endpoint.path, requestBody) : endpoint.path,
      body: endpoint.method === "GET" ? undefined : requestBody,
      metadata: {
        agentRunId: ctx.agentRunId,
        clientId: ctx.context.clientId as string | number | undefined,
        auditId: ctx.context.auditId as string | number | undefined,
        userId: ctx.context.userId as string | number | undefined,
        source: "optimax",
      },
      timeoutMs: 90_000,
    });

    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, data: { action: args.action, endpoint: endpoint.path, containerId: gtmContainerId, result: result.data } };
  },
};
