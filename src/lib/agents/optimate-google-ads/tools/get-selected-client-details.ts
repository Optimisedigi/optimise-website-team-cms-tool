import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { getPayload } from "payload";
import config from "@/payload.config";
import { customerKey, loadPortfolioAccounts, type PortfolioAccount } from "./_portfolio-accounts";

type FieldGroup = "contact" | "commercial" | "notes" | "timeline" | "business" | "locations" | "goals" | "all";

const VALID_GROUPS = new Set<FieldGroup>(["contact", "commercial", "notes", "timeline", "business", "locations", "goals", "all"]);

interface SelectedClientDetailsArgs {
  accountRefs?: Array<string | number>;
  fields?: FieldGroup[];
  limit?: number;
}

interface ClientDoc {
  id: number | string;
  name?: string | null;
  slug?: string | null;
  isActive?: boolean | null;
  websiteUrl?: string | null;
  websiteType?: string | null;
  businessType?: string | null;
  targetLocation?: string | null;
  clientGoals?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  accountManagers?: Array<{ name?: string | null; email?: string | null }> | null;
  hasPhysicalLocations?: boolean | null;
  numberOfLocations?: number | null;
  googleMapsUrls?: Array<{ url?: string | null; label?: string | null }> | null;
  conversionGoal?: string | null;
  secondaryConversionGoal?: string | null;
  clientStartDate?: string | null;
  monthlyRetainer?: number | null;
  googleAdsCustomerId?: string | null;
  clientNotes?: Array<{ category?: string | null; date?: string | null; author?: string | null; content?: string | null }> | null;
  accountTimeline?: Array<{ date?: string | null; serviceArea?: string | null; actionType?: string | null; description?: string | null }> | null;
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
    const groups = args.fields && args.fields.length > 0 ? args.fields : (["commercial", "timeline"] as FieldGroup[]);
    const limit = args.limit ?? 10;

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
        const client = (await payload.findByID({
          collection: "clients" as never,
          id: account.clientId as never,
          depth: 0,
          overrideAccess: true,
        })) as unknown as ClientDoc;
        results.push({
          accountRef: account.accountRef,
          clientId: account.clientId,
          displayName: account.displayName,
          maskedCustomerId: account.maskedCustomerId,
          client: projectClient(client, groups, limit),
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

    return { ok: true, data: { analysedCount: accounts.length, groupsReturned: groups, accounts: results } };
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

function projectClient(client: ClientDoc, groups: FieldGroup[], limit: number): Record<string, unknown> {
  const all = groups.includes("all");
  const want = (group: FieldGroup): boolean => all || groups.includes(group);
  const out: Record<string, unknown> = { id: client.id, name: client.name ?? null, slug: client.slug ?? null, isActive: client.isActive ?? null };
  if (want("commercial")) {
    out.commercial = {
      clientStartDate: client.clientStartDate ?? null,
      monthlyRetainer: client.monthlyRetainer ?? null,
      googleAdsCustomerId: client.googleAdsCustomerId ?? null,
    };
  }
  if (want("timeline")) {
    const timeline = Array.isArray(client.accountTimeline) ? client.accountTimeline : [];
    const sorted = timeline.slice().sort((a, b) => Date.parse(b.date ?? "") - Date.parse(a.date ?? ""));
    out.timeline = {
      totalCount: timeline.length,
      returned: Math.min(sorted.length, limit),
      entries: sorted.slice(0, limit).map((entry) => ({
        date: entry.date ?? null,
        serviceArea: entry.serviceArea ?? null,
        actionType: entry.actionType ?? null,
        description: entry.description ?? null,
      })),
    };
  }
  if (want("contact")) {
    out.contact = {
      contactName: client.contactName ?? null,
      contactEmail: client.contactEmail ?? null,
      accountManagers: Array.isArray(client.accountManagers)
        ? client.accountManagers.map((manager) => ({ name: manager.name ?? null, email: manager.email ?? null }))
        : [],
    };
  }
  if (want("notes")) {
    const notes = Array.isArray(client.clientNotes) ? client.clientNotes : [];
    const sorted = notes.slice().sort((a, b) => Date.parse(b.date ?? "") - Date.parse(a.date ?? ""));
    out.notes = {
      totalCount: notes.length,
      returned: Math.min(sorted.length, limit),
      items: sorted.slice(0, limit).map((note) => ({ date: note.date ?? null, author: note.author ?? null, category: note.category ?? null, content: note.content ?? null })),
    };
  }
  if (want("business")) {
    out.business = { websiteUrl: client.websiteUrl ?? null, websiteType: client.websiteType ?? null, businessType: client.businessType ?? null, targetLocation: client.targetLocation ?? null };
  }
  if (want("locations")) {
    out.locations = {
      hasPhysicalLocations: client.hasPhysicalLocations ?? null,
      numberOfLocations: client.numberOfLocations ?? null,
      googleMapsUrls: Array.isArray(client.googleMapsUrls) ? client.googleMapsUrls.map((url) => ({ url: url.url ?? null, label: url.label ?? null })) : [],
    };
  }
  if (want("goals")) {
    out.goals = { conversionGoal: client.conversionGoal ?? null, secondaryConversionGoal: client.secondaryConversionGoal ?? null, clientGoals: client.clientGoals ?? null };
  }
  return out;
}
