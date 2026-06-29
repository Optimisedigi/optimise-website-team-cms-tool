import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { growthToolsRequest } from "./_growth-tools";

interface ReviewTrackingChangesArgs {
  scope: "ga4" | "gtm" | "google_ads" | "all";
  pageUrl?: string;
  notes?: string;
}

const SCOPES = ["ga4", "gtm", "google_ads", "all"] as const;

function isScope(value: string): value is ReviewTrackingChangesArgs["scope"] {
  return (SCOPES as readonly string[]).includes(value);
}

export const reviewTrackingChanges: CanonicalTool<ReviewTrackingChangesArgs> = {
  name: "review_tracking_changes",
  description:
    "Run post-change QA after GA4, GTM, or Google Ads tracking/tagging writes through Growth Tools. Use after execute_ga4_action or execute_gtm_action, and when a Google Ads write affects conversion tracking or URLs.",
  inputSchema: {
    type: "object",
    properties: {
      scope: { type: "string", enum: [...SCOPES] },
      pageUrl: { type: "string", description: "Optional URL to validate for tags/events." },
      notes: { type: "string", maxLength: 500 },
    },
    required: ["scope"],
    additionalProperties: false,
  },
  validate(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const scope = String(obj.scope ?? "").trim();
    if (!isScope(scope)) throw new Error(`Unsupported review scope: ${scope}`);
    return {
      scope,
      ...(typeof obj.pageUrl === "string" && obj.pageUrl.trim() ? { pageUrl: obj.pageUrl.trim() } : {}),
      ...(typeof obj.notes === "string" && obj.notes.trim() ? { notes: obj.notes.trim() } : {}),
    };
  },
  async execute(args, ctx) {
    const result = await growthToolsRequest<unknown>({
      method: "POST",
      path: "/api/optimax/tracking/review",
      body: {
        scope: args.scope,
        customerId: typeof ctx.context.customerId === "string" ? ctx.context.customerId : undefined,
        ga4PropertyId: ctx.context.ga4PropertyId as string | null | undefined,
        ga4MeasurementId: ctx.context.ga4MeasurementId as string | null | undefined,
        gtmContainerId: ctx.context.gtmContainerId as string | null | undefined,
        expectedEvents: ctx.context.expectedEvents as string | null | undefined,
        ...(args.pageUrl ? { pageUrl: args.pageUrl } : {}),
        ...(args.notes ? { notes: args.notes } : {}),
      },
      metadata: {
        agentRunId: ctx.agentRunId,
        clientId: ctx.context.clientId as string | number | undefined,
        auditId: ctx.context.auditId as string | number | undefined,
        userId: ctx.context.userId as string | number | undefined,
        source: "optimax",
      },
      timeoutMs: 120_000,
    });

    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, data: { scope: args.scope, result: result.data } };
  },
};
