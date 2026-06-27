/**
 * Tool: get_client_details
 *
 * On-demand read of the linked client's CMS record. Designed to keep the
 * system prompt small — these fields are NOT pre-loaded into context. The
 * agent calls this only when the user asks something like "what's the
 * contact email?", "what's the monthly retainer?", "remind me what their
 * goals are", "show me recent notes".
 *
 * `fields` is a coarse projection so the agent can pull just the slice it
 * needs ('contact', 'commercial', 'notes', 'timeline', 'business',
 * 'locations', 'goals', 'all').
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import {
  buildOptimateClientProfile,
  type OptimateClientProfile,
  type OptimateClientProfileFieldGroup,
} from "@/lib/optimate-client-profile";
import { getPayload } from "payload";
import payloadConfig from "@/payload.config";

type FieldGroup =
  | "contact"
  | "commercial"
  | "notes"
  | "timeline"
  | "business"
  | "locations"
  | "goals"
  | "all";

const VALID_GROUPS = new Set<FieldGroup>([
  "contact",
  "commercial",
  "notes",
  "timeline",
  "business",
  "locations",
  "goals",
  "all",
]);

const DEFAULT_GROUPS: FieldGroup[] = ["contact", "commercial", "goals"];
const ALL_GROUPS: FieldGroup[] = ["contact", "commercial", "notes", "timeline", "business", "locations", "goals"];

interface GetClientDetailsArgs {
  fields?: FieldGroup[];
  /**
   * For groups that contain arrays (notes, timeline) — cap the returned rows
   * to the most recent N. Default 10. Max 50.
   */
  limit?: number;
}

export const getClientDetails: CanonicalTool<GetClientDetailsArgs> = {
  name: "get_client_details",
  description:
    "On-demand read of the linked client's CMS record. Use ONLY when the user asks about client info that isn't in the context — contact details, retainer/start date, business goals, recent notes, account timeline. Pass `fields` to project just the slice you need: 'contact' (name/email/account managers), 'commercial' (retainer, start date), 'notes', 'timeline' (account history entries), 'business' (type, website), 'locations' (physical + Google Maps), 'goals' (conversion goals + client goals). Use 'all' sparingly. Default returns ['contact','commercial','goals'] which is the cheapest summary.",
  inputSchema: {
    type: "object",
    properties: {
      fields: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "contact",
            "commercial",
            "notes",
            "timeline",
            "business",
            "locations",
            "goals",
            "all",
          ],
        },
        description:
          "Field groups to return. Default ['contact','commercial','goals']. 'all' returns everything.",
      },
      limit: {
        type: "number",
        description:
          "Max rows for array fields (notes, timeline). Default 10, max 50.",
      },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const out: GetClientDetailsArgs = {};
    if (Array.isArray(obj.fields)) {
      const filtered = obj.fields
        .map((f) => (typeof f === "string" ? f.trim().toLowerCase() : ""))
        .filter((f): f is FieldGroup => VALID_GROUPS.has(f as FieldGroup));
      if (filtered.length > 0) out.fields = filtered;
    }
    if (typeof obj.limit === "number" && Number.isFinite(obj.limit)) {
      out.limit = Math.max(1, Math.min(50, Math.floor(obj.limit)));
    }
    return out;
  },
  execute: async (args, ctx) => {
    const clientId = ctx.context.clientId as number | string | undefined;
    if (clientId === undefined || clientId === null) {
      return { ok: false, error: "No linked client; this tool needs a client-scoped chat." };
    }

    const groups = normaliseRequestedGroups(args.fields, DEFAULT_GROUPS);
    const cfg = await payloadConfig;
    const payload = await getPayload({ config: cfg });

    try {
      const profile = await buildOptimateClientProfile(payload, {
        id: clientId,
        fields: mapToProfileGroups(groups),
        limit: args.limit,
      });

      if (!profile) {
        return { ok: false, error: `Failed to load client ${clientId}: client not found` };
      }

      return {
        ok: true,
        data: {
          groupsReturned: groups.includes("all") ? ["all"] : groups,
          client: projectConciseClient(profile, groups),
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: `Failed to load client ${clientId}: ${(err as Error).message}`,
      };
    }
  },
};

function normaliseRequestedGroups(fields: FieldGroup[] | undefined, fallback: FieldGroup[]): FieldGroup[] {
  return fields && fields.length > 0 ? Array.from(new Set(fields)) : fallback;
}

function mapToProfileGroups(groups: FieldGroup[]): OptimateClientProfileFieldGroup[] {
  const requested = groups.includes("all") ? ALL_GROUPS : groups;
  const mapped = new Set<OptimateClientProfileFieldGroup>();

  for (const group of requested) {
    if (group === "all") continue;
    if (group === "commercial") {
      mapped.add("commercial");
      mapped.add("tracking");
      continue;
    }
    if (group === "business") {
      mapped.add("identity");
      mapped.add("business");
      continue;
    }
    mapped.add(group);
  }

  return [...mapped];
}

function projectConciseClient(profile: OptimateClientProfile, groups: FieldGroup[]): Record<string, unknown> {
  const all = groups.includes("all");
  const want = (group: FieldGroup): boolean => all || groups.includes(group);
  const out: Record<string, unknown> = {
    id: profile.id,
    name: profile.name,
    slug: profile.slug,
    isActive: profile.isActive,
  };

  if (want("contact")) {
    out.contact = profile.contact
      ? {
          contactName: profile.contact.contactName,
          contactEmail: profile.contact.contactEmail,
          accountManagers: profile.contact.accountManagers,
        }
      : { contactName: null, contactEmail: null, accountManagers: [] };
  }

  if (want("commercial")) {
    out.commercial = {
      clientStartDate: profile.commercial?.clientStartDate ?? null,
      monthlyRetainer: profile.commercial?.monthlyRetainer ?? null,
      googleAdsCustomerId: profile.tracking?.googleAdsCustomerId ?? null,
    };
  }

  if (want("business")) {
    out.business = {
      websiteUrl: profile.identity?.websiteUrl ?? null,
      websiteType: profile.identity?.websiteType ?? null,
      businessType: profile.business?.businessType ?? null,
      targetLocation: profile.business?.targetLocation ?? null,
    };
  }

  if (want("locations")) {
    out.locations = profile.locations ?? {
      hasPhysicalLocations: null,
      numberOfLocations: null,
      googleMapsUrls: [],
    };
  }

  if (want("goals")) {
    out.goals = {
      conversionGoal: profile.goals?.conversionGoal ?? null,
      secondaryConversionGoal: profile.goals?.secondaryConversionGoal ?? null,
      clientGoals: profile.goals?.clientGoals ?? null,
    };
  }

  if (want("notes")) out.notes = profile.notes ?? { totalCount: 0, returned: 0, items: [] };
  if (want("timeline")) out.timeline = profile.timeline ?? { totalCount: 0, returned: 0, entries: [] };

  return out;
}
