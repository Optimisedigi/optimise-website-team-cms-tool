import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { ensureCustomerId, growthToolsRequest, type GrowthToolsMethod } from "./_growth-tools";

const ALLOWED_PREFIXES = [
  "/api/google-ads/",
  "/api/ga4/",
  "/api/gsc/",
  "/api/ai-visibility/",
  "/api/serp/",
  "/api/clients/",
] as const;

const BLOCKED_PATH_TOKENS = [
  "apply",
  "assign",
  "build",
  "create",
  "delete",
  "deploy",
  "enable",
  "pause",
  "publish",
  "push",
  "restructure",
  "sync",
  "update",
] as const;

const BLOCKED_METHODS = new Set<GrowthToolsMethod>(["PUT", "PATCH", "DELETE"]);

type JsonObject = Record<string, unknown>;

interface GrowthToolsReadArgs {
  method: "GET" | "POST";
  path: string;
  query?: JsonObject;
  body?: JsonObject;
  reason?: string;
}

function assertObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function optionalObject(value: unknown, label: string): JsonObject | undefined {
  if (value === undefined || value === null) return undefined;
  return assertObject(value, label);
}

function cleanPath(raw: unknown): string {
  const path = String(raw ?? "").trim();
  const pathname = path.split("?", 1)[0] ?? "";
  if (!pathname.startsWith("/api/")) throw new Error("path must start with /api/");
  if (pathname.includes("..") || pathname.includes("//")) throw new Error("path contains an unsafe segment");
  if (!ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    throw new Error(`path must start with one of: ${ALLOWED_PREFIXES.join(", ")}`);
  }
  const lowerPathname = pathname.toLowerCase();
  const blocked = BLOCKED_PATH_TOKENS.find((token) => new RegExp(`(^|[/_-])${token}($|[/_-])`).test(lowerPathname));
  if (blocked) {
    throw new Error(`growth_tools_read is read-only; path token "${blocked}" requires an execute_* tool`);
  }
  return path;
}

function appendQuery(path: string, query: JsonObject): string {
  const [base, existing = ""] = path.split("?", 2);
  const qs = new URLSearchParams(existing);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      qs.delete(key);
      for (const item of value) qs.append(key, String(item));
      continue;
    }
    if (typeof value === "object") {
      qs.set(key, JSON.stringify(value));
      continue;
    }
    qs.set(key, String(value));
  }
  const out = qs.toString();
  return out ? `${base}?${out}` : base;
}

function hasConflictingScopedId(input: JsonObject | undefined, keys: string[], expected: string | null): string | null {
  if (!input || !expected) return null;
  for (const key of keys) {
    const raw = input[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const actual = String(raw).replace(/-/g, "");
    const normalizedExpected = expected.replace(/-/g, "");
    if (actual !== normalizedExpected) return key;
  }
  return null;
}

function scopedParams(args: {
  path: string;
  query?: JsonObject;
  body?: JsonObject;
  customerId: string;
  ga4PropertyId?: string | null;
  ga4MeasurementId?: string | null;
  gtmContainerId?: string | null;
  clientId?: string | number;
  auditId?: string | number;
}): { query: JsonObject; body: JsonObject | undefined } {
  const query = { ...(args.query ?? {}) };
  const body = args.body ? { ...args.body } : undefined;
  const pathname = args.path.split("?", 1)[0] ?? args.path;
  const googleAdsScoped = pathname.startsWith("/api/google-ads/");
  const ga4Scoped = pathname.startsWith("/api/ga4/");
  const gtmScoped = pathname.includes("gtm") || pathname.includes("tag-manager");

  const customerConflict = hasConflictingScopedId(query, ["customerId", "customer_id"], args.customerId)
    ?? hasConflictingScopedId(body, ["customerId", "customer_id"], args.customerId);
  if (customerConflict) throw new Error(`Cannot override selected client customerId via ${customerConflict}`);

  if (googleAdsScoped) {
    query.customerId = args.customerId;
    if (body) body.customerId = args.customerId;
  }

  if (ga4Scoped && args.ga4PropertyId) {
    const ga4Conflict = hasConflictingScopedId(query, ["propertyId", "ga4PropertyId"], args.ga4PropertyId)
      ?? hasConflictingScopedId(body, ["propertyId", "ga4PropertyId"], args.ga4PropertyId);
    if (ga4Conflict) throw new Error(`Cannot override selected client GA4 property via ${ga4Conflict}`);
    query.propertyId = args.ga4PropertyId;
    if (body) body.propertyId = args.ga4PropertyId;
  }

  if (gtmScoped && args.gtmContainerId) {
    const gtmConflict = hasConflictingScopedId(query, ["containerId", "gtmContainerId"], args.gtmContainerId)
      ?? hasConflictingScopedId(body, ["containerId", "gtmContainerId"], args.gtmContainerId);
    if (gtmConflict) throw new Error(`Cannot override selected client GTM container via ${gtmConflict}`);
    query.containerId = args.gtmContainerId;
    if (body) body.containerId = args.gtmContainerId;
  }

  if (args.ga4MeasurementId && query.measurementId === undefined) {
    query.measurementId = args.ga4MeasurementId;
    if (body && body.measurementId === undefined) body.measurementId = args.ga4MeasurementId;
  }
  if (args.clientId !== undefined && query.clientId === undefined) {
    query.clientId = args.clientId;
    if (body && body.clientId === undefined) body.clientId = args.clientId;
  }
  if (args.auditId !== undefined && query.auditId === undefined) {
    query.auditId = args.auditId;
    if (body && body.auditId === undefined) body.auditId = args.auditId;
  }

  return { query, body };
}

export const growthToolsRead: CanonicalTool<GrowthToolsReadArgs> = {
  name: "growth_tools_read",
  description:
    "Future-proof read-only bridge to Growth Tools APIs for the selected client. Use it when a specific built-in reporting tool is missing. It can call approved Growth Tools read/report endpoints under /api/google-ads/*, /api/ga4/*, /api/gsc/*, /api/ai-visibility/*, /api/serp/*, and /api/clients/* with GET or read-only POST. The tool injects the selected client's customerId/GA4/GTM IDs and blocks write-like paths such as apply, create, update, pause, push, publish, deploy, and delete.",
  inputSchema: {
    type: "object",
    properties: {
      method: { type: "string", enum: ["GET", "POST"], description: "GET by default. Use POST only for Growth Tools report/query endpoints that require a JSON body." },
      path: { type: "string", description: "Growth Tools API path, including optional query string. Must start with an approved /api/* read/report prefix." },
      query: { type: "object", description: "Optional query params. The selected client IDs are injected/overridden safely.", additionalProperties: true },
      body: { type: "object", description: "Optional JSON body for read-only POST report/query endpoints. Do not include customerId/clientId/auditId metadata.", additionalProperties: true },
      reason: { type: "string", maxLength: 300, description: "Brief reason for this custom Growth Tools read." },
    },
    required: ["path"],
    additionalProperties: false,
  },
  validate(raw) {
    const obj = assertObject(raw, "input");
    const method = String(obj.method ?? "GET").toUpperCase() as GrowthToolsMethod;
    if (BLOCKED_METHODS.has(method) || !["GET", "POST"].includes(method)) {
      throw new Error("growth_tools_read only supports GET and read-only POST");
    }
    return {
      method: method as "GET" | "POST",
      path: cleanPath(obj.path),
      ...(optionalObject(obj.query, "query") ? { query: optionalObject(obj.query, "query") } : {}),
      ...(optionalObject(obj.body, "body") ? { body: optionalObject(obj.body, "body") } : {}),
      ...(typeof obj.reason === "string" && obj.reason.trim() ? { reason: obj.reason.trim() } : {}),
    };
  },
  async execute(args, ctx) {
    let customerId: string;
    try {
      customerId = ensureCustomerId(ctx.context.customerId);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    try {
      const scoped = scopedParams({
        path: args.path,
        query: args.query,
        body: args.body,
        customerId,
        ga4PropertyId: typeof ctx.context.ga4PropertyId === "string" ? ctx.context.ga4PropertyId : null,
        ga4MeasurementId: typeof ctx.context.ga4MeasurementId === "string" ? ctx.context.ga4MeasurementId : null,
        gtmContainerId: typeof ctx.context.gtmContainerId === "string" ? ctx.context.gtmContainerId : null,
        clientId: ctx.context.clientId as string | number | undefined,
        auditId: ctx.context.auditId as string | number | undefined,
      });
      const path = appendQuery(args.path, scoped.query);
      const result = await growthToolsRequest<unknown>({
        method: args.method,
        path,
        body: args.method === "POST" ? scoped.body ?? {} : undefined,
        timeoutMs: 90_000,
      });
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        data: {
          source: `Growth Tools ${args.method} ${path}`,
          selectedCustomerId: customerId,
          reason: args.reason ?? null,
          result: result.data,
        },
      };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
};
