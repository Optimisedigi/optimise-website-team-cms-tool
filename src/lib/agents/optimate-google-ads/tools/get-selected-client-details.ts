import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import {
  buildOptimateClientProfile,
  type OptimateClientProfile,
  type OptimateClientProfileFieldGroup,
} from "@/lib/optimate-client-profile";
import { getPayload } from "payload";
import config from "@/payload.config";
import { customerKey, loadPortfolioAccounts, type PortfolioAccount } from "./_portfolio-accounts";

type FieldGroup = "contact" | "commercial" | "notes" | "timeline" | "business" | "locations" | "goals" | "all";

const VALID_GROUPS = new Set<FieldGroup>(["contact", "commercial", "notes", "timeline", "business", "locations", "goals", "all"]);
const DEFAULT_GROUPS: FieldGroup[] = ["commercial", "timeline"];
const ALL_GROUPS: FieldGroup[] = ["contact", "commercial", "notes", "timeline", "business", "locations", "goals"];

interface SelectedClientDetailsArgs {
  accountRefs?: Array<string | number>;
  fields?: FieldGroup[];
  limit?: number;
}

const MAX_ACCOUNTS = 10;

export const getSelectedClientDetails: CanonicalTool<SelectedClientDetailsArgs> = {
  name: "get_selected_client_details",
  description:
    "Read CMS client details for the currently selected portfolio accounts, one account at a time and labelled per account. Use when selected-account chat/voice asks for client start dates, Google Ads start dates, contact details, retainers, client notes, or account timeline/history. Args: accountRefs (server-injected for voice; optional in text), fields ('commercial','timeline','contact','notes','business','locations','goals','all'), limit for notes/timeline. Returns one result per selected account with clientStartDate and accountTimeline when requested.",
  inputSchema: {
    type: "object",
    properties: {
      accountRefs: { type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }] } },
      fields: {
        type: "array",
        items: { type: "string", enum: ["contact", "commercial", "notes", "timeline", "business", "locations", "goals", "all"] },
      },
      limit: { type: "integer", minimum: 1, maximum: 50 },
    },
    additionalProperties: false,
  },
  validate: (raw) => {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const out: SelectedClientDetailsArgs = {};
    if (Array.isArray(obj.accountRefs)) out.accountRefs = obj.accountRefs.filter((v) => typeof v === "string" || typeof v === "number");
    if (Array.isArray(obj.fields)) {
      const fields = obj.fields
        .map((field) => (typeof field === "string" ? field.trim().toLowerCase() : ""))
        .filter((field): field is FieldGroup => VALID_GROUPS.has(field as FieldGroup));
      if (fields.length > 0) out.fields = fields;
    }
    if (obj.limit !== undefined) {
      const n = Number(obj.limit);
      if (!Number.isFinite(n) || n < 1) throw new Error("limit must be between 1 and 50");
      out.limit = Math.min(50, Math.floor(n));
    }
    return out;
  },
  execute: async (args, ctx) => {
    const accountRefs = args.accountRefs?.length
      ? args.accountRefs
      : Array.isArray(ctx.context.selectedAccountRefs)
        ? (ctx.context.selectedAccountRefs as Array<string | number>)
        : undefined;
    const accounts = selectAccounts(await loadPortfolioAccounts(), accountRefs);
    const payload = await getPayload({ config });
    const groups = normaliseRequestedGroups(args.fields, DEFAULT_GROUPS);

    const results = [];
    for (const account of accounts) {
      if (account.clientId === undefined || account.clientId === null) {
        results.push({
          accountRef: account.accountRef,
          clientId: null,
          displayName: account.displayName,
          maskedCustomerId: account.maskedCustomerId,
          error: "No linked CMS client found for this Google Ads account.",
        });
        continue;
      }
      try {
        const profile = await buildOptimateClientProfile(payload, {
          id: account.clientId,
          fields: mapToProfileGroups(groups),
          limit: args.limit,
        });

        results.push({
          accountRef: account.accountRef,
          clientId: account.clientId,
          displayName: account.displayName,
          maskedCustomerId: account.maskedCustomerId,
          ...(profile
            ? { client: projectConciseClient(profile, groups) }
            : { error: "Client not found." }),
        });
      } catch (err) {
        results.push({
          accountRef: account.accountRef,
          clientId: account.clientId,
          displayName: account.displayName,
          maskedCustomerId: account.maskedCustomerId,
          error: (err as Error).message,
        });
      }
    }

    return { ok: true, data: { analysedCount: accounts.length, groupsReturned: groups.includes("all") ? ["all"] : groups, accounts: results } };
  },
};

function selectAccounts(accounts: PortfolioAccount[], refs: Array<string | number> | undefined): PortfolioAccount[] {
  if (!refs || refs.length === 0) return accounts.filter((account) => account.managed).slice(0, MAX_ACCOUNTS);
  const refSet = new Set(refs.map(String));
  return accounts
    .filter((account) =>
      (account.accountRef !== undefined && refSet.has(String(account.accountRef))) ||
      (account.clientId !== undefined && refSet.has(String(account.clientId))) ||
      refSet.has(customerKey(account.customerId)),
    )
    .slice(0, MAX_ACCOUNTS);
}

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
  const out: Record<string, unknown> = { id: profile.id, name: profile.name, slug: profile.slug, isActive: profile.isActive };

  if (want("commercial")) {
    out.commercial = {
      clientStartDate: profile.commercial?.clientStartDate ?? null,
      monthlyRetainer: profile.commercial?.monthlyRetainer ?? null,
      googleAdsCustomerId: profile.tracking?.googleAdsCustomerId ?? null,
    };
  }
  if (want("timeline")) out.timeline = profile.timeline ?? { totalCount: 0, returned: 0, entries: [] };
  if (want("contact")) {
    out.contact = profile.contact
      ? {
          contactName: profile.contact.contactName,
          contactEmail: profile.contact.contactEmail,
          accountManagers: profile.contact.accountManagers,
        }
      : { contactName: null, contactEmail: null, accountManagers: [] };
  }
  if (want("notes")) out.notes = profile.notes ?? { totalCount: 0, returned: 0, items: [] };
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
  return out;
}
