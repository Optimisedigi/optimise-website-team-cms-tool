import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { growthToolsRequest } from "./_growth-tools";

const GA4_ACTIONS = [
  "audience_create",
  "audience_update",
  "key_event_create_or_mark",
  "conversion_event_update",
  "growth_tools_request",
] as const;

type Ga4ActionType = (typeof GA4_ACTIONS)[number];

interface ExecuteGa4ActionArgs {
  action: Ga4ActionType;
  payload: Record<string, unknown>;
  summary?: string;
}

const GA4_ACTION_ENDPOINTS: Partial<Record<Ga4ActionType, { method: "POST"; path: string }>> = {
  audience_create: { method: "POST", path: "/api/ga4/admin/audiences/create" },
  audience_update: { method: "POST", path: "/api/ga4/admin/audiences/update" },
  key_event_create_or_mark: { method: "POST", path: "/api/ga4/admin/key-events/create-or-mark" },
  conversion_event_update: { method: "POST", path: "/api/ga4/admin/conversion-events/update" },
};

function isGa4Action(value: string): value is Ga4ActionType {
  return (GA4_ACTIONS as readonly string[]).includes(value);
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function resolveEndpoint(action: Ga4ActionType, payload: Record<string, unknown>): { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; path: string } {
  if (action === "growth_tools_request") {
    const path = String(payload.path ?? payload.endpointPath ?? "").trim();
    if (!path.startsWith("/api/ga4/") && !path.startsWith("/api/google-analytics/")) {
      throw new Error("growth_tools_request path must start with /api/ga4/ or /api/google-analytics/");
    }
    const method = String(payload.method ?? "POST").toUpperCase();
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      throw new Error("growth_tools_request method must be GET, POST, PUT, PATCH, or DELETE");
    }
    return { method: method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path };
  }
  const endpoint = GA4_ACTION_ENDPOINTS[action];
  if (!endpoint) throw new Error(`No Growth Tools endpoint mapped for ${action}`);
  return endpoint;
}

function actionPayload(action: Ga4ActionType, payload: Record<string, unknown>): Record<string, unknown> {
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

export const executeGa4Action: CanonicalTool<ExecuteGa4ActionArgs> = {
  name: "execute_ga4_action",
  description:
    "Execute a GA4 Admin change through Growth Tools for the selected client, such as creating/updating audiences or key events. Uses ga4PropertyId from selected client context and returns reconnect/scope errors from Growth Tools when analytics.edit access is missing. Use growth_tools_request for any existing Growth Tools /api/ga4/* or /api/google-analytics/* endpoint.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: [...GA4_ACTIONS] },
      payload: { type: "object", description: "Action payload. For growth_tools_request, include method, path, and optional body.", additionalProperties: true },
      summary: { type: "string", maxLength: 500 },
    },
    required: ["action", "payload"],
    additionalProperties: false,
  },
  validate(raw) {
    const obj = assertObject(raw, "input");
    const action = String(obj.action ?? "").trim();
    if (!isGa4Action(action)) throw new Error(`Unsupported GA4 action: ${action}`);
    return {
      action,
      payload: assertObject(obj.payload, "payload"),
      ...(typeof obj.summary === "string" && obj.summary.trim() ? { summary: obj.summary.trim() } : {}),
    };
  },
  async execute(args, ctx) {
    const ga4PropertyId = String(ctx.context.ga4PropertyId ?? "").trim();
    if (!ga4PropertyId) {
      return { ok: false, error: "Selected client has no ga4PropertyId. Connect or set the GA4 property before running GA4 admin actions." };
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
      propertyId: ga4PropertyId,
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
    return { ok: true, data: { action: args.action, endpoint: endpoint.path, propertyId: ga4PropertyId, result: result.data } };
  },
};
