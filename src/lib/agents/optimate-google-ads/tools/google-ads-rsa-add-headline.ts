import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { createChangePreview, type ChangePreviewDb } from "../change-previews";
import { ensureCustomerId, growthToolsRequest, type GrowthToolsResult } from "./_growth-tools";
import { defaultPreviewDb, optionalId } from "./execute-google-ads-action";

const PINNED_FIELDS = ["HEADLINE_1", "HEADLINE_2", "HEADLINE_3"] as const;
type PinnedField = (typeof PINNED_FIELDS)[number];
const MAX_TARGETS = 20;
const AD_GROUP_AD_RESOURCE = /^customers\/\d+\/adGroupAds\/\d+~\d+$/;
const REPLACEMENT_WARNING =
  "Adding a headline replaces each ad: Google gives it a new ID and its past performance stays with the old ad.";

interface RsaAddHeadlineArgs {
  targets: Array<{ campaignId: string; adGroupId: string }>;
  headline: string;
  headlinePinnedField?: PinnedField;
  removeHeadlineByAdGroupAdResourceName?: Record<string, string>;
  summary: string;
}

interface RsaHeadline {
  text: string;
  pinnedField?: string | null;
}

interface RsaPreviewAd {
  campaignName?: string;
  adGroupId?: string;
  adGroupName?: string;
  adGroupAdResourceName?: string;
  headlines?: RsaHeadline[];
  resultingHeadlines?: RsaHeadline[];
  headlineToRemove?: string;
  requiresReplacement?: boolean;
}

interface RsaPreviewResponse {
  fingerprint?: string;
  sourceFingerprint?: string;
  warnings?: string[];
  ads?: RsaPreviewAd[];
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function numericId(value: unknown, label: string): string {
  const id = String(value ?? "").trim();
  if (!/^\d+$/.test(id)) throw new Error(`${label} must be a numeric ID`);
  return id;
}

function isPinnedField(value: unknown): value is PinnedField {
  return typeof value === "string" && (PINNED_FIELDS as readonly string[]).includes(value);
}

function headlineTexts(headlines: RsaHeadline[] | undefined): string[] {
  return (headlines ?? []).map((h) => (h.pinnedField ? `${h.text} [${h.pinnedField}]` : h.text));
}

function compactAd(ad: RsaPreviewAd) {
  return {
    campaign: ad.campaignName ?? null,
    adGroup: ad.adGroupName ?? ad.adGroupId ?? null,
    adGroupAdResourceName: ad.adGroupAdResourceName ?? null,
    currentHeadlines: headlineTexts(ad.headlines),
    resultingHeadlines: headlineTexts(ad.resultingHeadlines),
    ...(ad.headlineToRemove ? { headlineToRemove: ad.headlineToRemove } : {}),
  };
}

type Send = (body: Record<string, unknown>) => Promise<GrowthToolsResult<RsaPreviewResponse>>;

const defaultSend: Send = (body) =>
  growthToolsRequest<RsaPreviewResponse>({ method: "POST", path: "/api/google-ads/rsa/preview", body, timeoutMs: 60_000 });

/**
 * Builds the tool. `openDb`, `send` and `now` are injectable for tests.
 *
 * Growth Tools previews the headline addition (read-only); the matching
 * rsa/apply request is stored as a change card and only runs when the user
 * taps Apply live. Growth Tools rejects the apply if the ad changed since.
 */
export function createGoogleAdsRsaAddHeadlineTool(
  openDb: () => Promise<ChangePreviewDb> = defaultPreviewDb,
  send: Send = defaultSend,
  now: () => Date = () => new Date(),
): CanonicalTool<RsaAddHeadlineArgs> {
  return {
    name: "google_ads_rsa_add_headline",
    description:
      "Prepare adding ONE headline (1 to 30 characters, optionally pinned to HEADLINE_1/2/3) to the enabled responsive search ads in the given ad groups of the selected client. Returns each ad's current and resulting headlines and saves a change card; the ads change only when the user taps Apply live. Each ad is replaced, so it gets a new ID. An ad that already has 15 headlines needs removeHeadlineByAdGroupAdResourceName naming the exact headline to drop; if missing, the tool returns those ads so you can ask the user which to drop. For any other RSA edit use google_ads_query then google_ads_mutate_preview.",
    inputSchema: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          minItems: 1,
          maxItems: MAX_TARGETS,
          items: {
            type: "object",
            properties: { campaignId: { type: "string" }, adGroupId: { type: "string" } },
            required: ["campaignId", "adGroupId"],
            additionalProperties: false,
          },
        },
        headline: { type: "string", minLength: 1, maxLength: 30 },
        headlinePinnedField: { type: "string", enum: [...PINNED_FIELDS] },
        removeHeadlineByAdGroupAdResourceName: {
          type: "object",
          description: "For ads already at 15 headlines: adGroupAd resource name -> exact headline text to remove.",
          additionalProperties: { type: "string" },
        },
        summary: { type: "string", minLength: 5, maxLength: 500 },
      },
      required: ["targets", "headline", "summary"],
      additionalProperties: false,
    },
    // Each call stores a preview row; identical repeats in one run reuse the first.
    sideEffect: true,
    validate(raw) {
      const input = asObject(raw, "input");
      if (!Array.isArray(input.targets) || input.targets.length < 1 || input.targets.length > MAX_TARGETS) {
        throw new Error(`targets must contain 1 to ${MAX_TARGETS} ad groups`);
      }
      const targets = input.targets.map((raw, index) => {
        const target = asObject(raw, `targets[${index}]`);
        return {
          campaignId: numericId(target.campaignId, `targets[${index}].campaignId`),
          adGroupId: numericId(target.adGroupId, `targets[${index}].adGroupId`),
        };
      });
      const headline = typeof input.headline === "string" ? input.headline.trim() : "";
      if (headline.length < 1 || headline.length > 30) throw new Error("headline must be 1 to 30 characters");
      if (input.headlinePinnedField !== undefined && !isPinnedField(input.headlinePinnedField)) {
        throw new Error("headlinePinnedField must be HEADLINE_1, HEADLINE_2 or HEADLINE_3");
      }
      let removals: Record<string, string> | undefined;
      if (input.removeHeadlineByAdGroupAdResourceName !== undefined) {
        const map = asObject(input.removeHeadlineByAdGroupAdResourceName, "removeHeadlineByAdGroupAdResourceName");
        removals = {};
        for (const [resourceName, text] of Object.entries(map)) {
          if (!AD_GROUP_AD_RESOURCE.test(resourceName)) throw new Error(`invalid adGroupAd resource name: ${resourceName}`);
          if (typeof text !== "string" || !text.trim()) throw new Error(`headline to remove for ${resourceName} must be text`);
          removals[resourceName] = text;
        }
      }
      const summary = typeof input.summary === "string" ? input.summary.trim() : "";
      if (summary.length < 5) throw new Error("summary is required");
      return {
        targets,
        headline,
        ...(isPinnedField(input.headlinePinnedField) ? { headlinePinnedField: input.headlinePinnedField } : {}),
        ...(removals && Object.keys(removals).length > 0 ? { removeHeadlineByAdGroupAdResourceName: removals } : {}),
        summary: summary.slice(0, 500),
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

      const previewBody: Record<string, unknown> = {
        customerId,
        targets: args.targets,
        headline: args.headline,
        ...(args.headlinePinnedField ? { headlinePinnedField: args.headlinePinnedField } : {}),
        ...(args.removeHeadlineByAdGroupAdResourceName
          ? { removeHeadlineByAdGroupAdResourceName: args.removeHeadlineByAdGroupAdResourceName }
          : {}),
      };
      const preview = await send(previewBody);
      if (!preview.ok) return { ok: false, error: `Headline preview failed, nothing was saved: ${preview.error ?? "unknown error"}` };
      const data = preview.data;
      const ads = Array.isArray(data?.ads) ? data.ads : [];
      if (!data?.fingerprint || !data.sourceFingerprint || ads.length === 0) {
        return { ok: false, error: "Growth Tools returned an incomplete headline preview; nothing was saved." };
      }

      const full = ads.filter((ad) => ad.requiresReplacement && !ad.headlineToRemove);
      if (full.length > 0) {
        return {
          ok: true,
          data: {
            previewed: false,
            needsHeadlineRemoval: full.map(compactAd),
            nextStep:
              "Nothing was saved. These ads already have 15 headlines. Ask the user which headline to drop from each, then call this tool again with removeHeadlineByAdGroupAdResourceName.",
          },
        };
      }

      const clientId = optionalId(ctx.context.clientId);
      const auditId = optionalId(ctx.context.auditId);
      let stored: { id: number; expiresAt: string };
      try {
        stored = await createChangePreview(await openDb(), {
          ownerId,
          customerId,
          ...(auditId !== undefined ? { auditId } : {}),
          ...(clientId !== undefined ? { clientId } : {}),
          agentRunId: ctx.agentRunId,
          action: "rsa_add_headline",
          method: "POST",
          path: "/api/google-ads/rsa/apply",
          // Exactly what Apply live sends; Growth Tools refuses it if the ads changed since this preview.
          requestBody: {
            ...previewBody,
            fingerprint: data.fingerprint,
            sourceFingerprint: data.sourceFingerprint,
            confirm: true,
          },
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
          applied: false,
          changeId: stored.id,
          expiresAt: stored.expiresAt,
          ads: ads.map(compactAd),
          warning: REPLACEMENT_WARNING,
          nextStep:
            "Nothing has changed in Google Ads yet. Tell the user the headline change is ready in the change card and mention that each ad is replaced with a new ID. They need to tap Apply live (or Cancel). Do not say it is live or applied.",
        },
      };
    },
  };
}

export const googleAdsRsaAddHeadline = createGoogleAdsRsaAddHeadlineTool();
