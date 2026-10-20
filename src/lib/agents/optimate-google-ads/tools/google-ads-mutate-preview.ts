import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { createChangePreview, type ChangePreviewDb } from "../change-previews";
import { ensureCustomerId, growthToolsRequest, type GrowthToolsResult } from "./_growth-tools";
import { defaultPreviewDb, optionalId } from "./execute-google-ads-action";

export const MUTATE_MAX_OPERATIONS = 100;
/** Same refusal list as Growth Tools: account access, account links and billing. */
const BLOCKED_OPERATION = /useraccess|invitation|link|billing|accountbudget/i;

interface MutatePreviewArgs {
  operations: Array<Record<string, unknown>>;
  summary: string;
}

/** Null when every entry is one well-formed, permitted GoogleAdsService MutateOperation. */
export function checkMutateOperations(operations: unknown): string | null {
  if (!Array.isArray(operations) || operations.length < 1 || operations.length > MUTATE_MAX_OPERATIONS) {
    return `operations must contain 1 to ${MUTATE_MAX_OPERATIONS} operations`;
  }
  for (const [index, operation] of operations.entries()) {
    if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
      return `operations[${index}] must be an object`;
    }
    const keys = Object.keys(operation);
    const key = keys[0];
    if (keys.length !== 1 || !key || !key.endsWith("Operation")) {
      return `operations[${index}] must contain exactly one <resource>Operation, e.g. { "campaignOperation": { ... } }`;
    }
    const body = (operation as Record<string, unknown>)[key];
    if (!body || typeof body !== "object" || Array.isArray(body)) return `operations[${index}].${key} must be an object`;
    if (BLOCKED_OPERATION.test(key)) {
      return `operations[${index}].${key} is not allowed: account access, account links and billing must be changed in Google Ads directly`;
    }
  }
  return null;
}

type Send = (body: Record<string, unknown>) => Promise<GrowthToolsResult<unknown>>;

const defaultSend: Send = (body) =>
  growthToolsRequest<unknown>({ method: "POST", path: "/api/google-ads/mutate", body, timeoutMs: 60_000 });

/**
 * Builds the tool. `openDb`, `send` and `now` are injectable for tests.
 *
 * Google checks the operations with validateOnly first; only a change Google
 * accepts is stored, and it goes live only when the user taps Apply live.
 */
export function createGoogleAdsMutatePreviewTool(
  openDb: () => Promise<ChangePreviewDb> = defaultPreviewDb,
  send: Send = defaultSend,
  now: () => Date = () => new Date(),
): CanonicalTool<MutatePreviewArgs> {
  return {
    name: "google_ads_mutate_preview",
    description:
      "Prepare any Google Ads change the API supports (create, update or remove: bid strategies, target CPA/ROAS, ad schedules, locations, audiences, assets, keywords, ads and more) on the selected client's account, as GoogleAdsService MutateOperations. Google validates the operations without applying them; if valid, the user gets a change card and the change goes live only when they tap Apply live. Read current values with google_ads_query first, and for updates include an updateMask listing exactly the fields you change. Prefer execute_google_ads_action when one of its mapped actions fits. Account access, account links and billing cannot be changed. Never pass a customer ID.",
    inputSchema: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          minItems: 1,
          maxItems: MUTATE_MAX_OPERATIONS,
          description:
            'GoogleAdsService MutateOperations in REST JSON, e.g. [{ "campaignOperation": { "update": { "resourceName": "customers/<id>/campaigns/123", "status": "PAUSED" }, "updateMask": "status" } }]',
          items: { type: "object", additionalProperties: true },
        },
        summary: { type: "string", minLength: 5, maxLength: 500, description: "Plain-English description of the change, shown on the change card." },
      },
      required: ["operations", "summary"],
      additionalProperties: false,
    },
    // Each call stores a preview row; identical repeats in one run reuse the first.
    sideEffect: true,
    validate(raw) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("input must be an object");
      const input = raw as Record<string, unknown>;
      const problem = checkMutateOperations(input.operations);
      if (problem) throw new Error(problem);
      const summary = typeof input.summary === "string" ? input.summary.trim() : "";
      if (summary.length < 5) throw new Error("summary is required");
      return { operations: input.operations as Array<Record<string, unknown>>, summary: summary.slice(0, 500) };
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

      const validation = await send({ customerId, operations: args.operations, validateOnly: true });
      if (!validation.ok) {
        return { ok: false, error: `Google rejected these operations, nothing was saved: ${validation.error ?? "unknown error"}` };
      }

      const clientId = optionalId(ctx.context.clientId);
      const auditId = optionalId(ctx.context.auditId);
      let preview: { id: number; expiresAt: string };
      try {
        preview = await createChangePreview(await openDb(), {
          ownerId,
          customerId,
          ...(auditId !== undefined ? { auditId } : {}),
          ...(clientId !== undefined ? { clientId } : {}),
          agentRunId: ctx.agentRunId,
          action: "google_ads_mutate",
          method: "POST",
          path: "/api/google-ads/mutate",
          // Exactly what Apply live sends: the validated operations, now for real.
          requestBody: { customerId, operations: args.operations, validateOnly: false, confirm: true },
          summary: args.summary,
          now: now(),
        });
      } catch (err) {
        return { ok: false, error: `Could not save the change preview: ${(err as Error).message}` };
      }

      return {
        ok: true,
        data: {
          previewed: true,
          validatedByGoogle: true,
          applied: false,
          changeId: preview.id,
          operationCount: args.operations.length,
          expiresAt: preview.expiresAt,
          nextStep:
            "Nothing has changed in Google Ads yet. Tell the user the change is ready in the change card and that they need to tap Apply live to make it live (or Cancel). Do not say it is live or applied.",
        },
      };
    },
  };
}

export const googleAdsMutatePreview = createGoogleAdsMutatePreviewTool();
