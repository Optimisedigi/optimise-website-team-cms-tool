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

interface GetClientDetailsArgs {
  fields?: FieldGroup[];
  /**
   * For groups that contain arrays (notes, timeline) — cap the returned rows
   * to the most recent N. Default 10. Max 50.
   */
  limit?: number;
}

interface ClientNote {
  category?: string | null;
  date?: string | null;
  author?: string | null;
  content?: string | null;
}

interface AccountTimelineEntry {
  date?: string | null;
  serviceArea?: string | null;
  actionType?: string | null;
  description?: string | null;
}

interface AccountManager {
  name?: string | null;
  email?: string | null;
}

interface GoogleMapsUrl {
  url?: string | null;
  label?: string | null;
}

interface ClientDoc {
  id: number;
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
  accountManagers?: AccountManager[] | null;
  hasPhysicalLocations?: boolean | null;
  numberOfLocations?: number | null;
  googleMapsUrls?: GoogleMapsUrl[] | null;
  conversionGoal?: string | null;
  secondaryConversionGoal?: string | null;
  clientStartDate?: string | null;
  monthlyRetainer?: number | null;
  googleAdsCustomerId?: string | null;
  clientNotes?: ClientNote[] | null;
  accountTimeline?: AccountTimelineEntry[] | null;
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

    const cfg = await payloadConfig;
    const payload = await getPayload({ config: cfg });

    let client: ClientDoc;
    try {
      client = (await payload.findByID({
        collection: "clients",
        id: clientId as never,
        depth: 0,
        overrideAccess: true,
      })) as unknown as ClientDoc;
    } catch (err) {
      return {
        ok: false,
        error: `Failed to load client ${clientId}: ${(err as Error).message}`,
      };
    }

    const groups: FieldGroup[] = args.fields && args.fields.length > 0
      ? args.fields
      : ["contact", "commercial", "goals"];
    const all = groups.includes("all");
    const want = (g: FieldGroup) => all || groups.includes(g);
    const limit = args.limit ?? 10;

    const out: Record<string, unknown> = {
      id: client.id,
      name: client.name ?? null,
      slug: client.slug ?? null,
      isActive: client.isActive ?? null,
    };

    if (want("contact")) {
      out.contact = {
        contactName: client.contactName ?? null,
        contactEmail: client.contactEmail ?? null,
        accountManagers: Array.isArray(client.accountManagers)
          ? client.accountManagers.map((m) => ({
              name: m.name ?? null,
              email: m.email ?? null,
            }))
          : [],
      };
    }

    if (want("commercial")) {
      out.commercial = {
        clientStartDate: client.clientStartDate ?? null,
        monthlyRetainer: client.monthlyRetainer ?? null,
        googleAdsCustomerId: client.googleAdsCustomerId ?? null,
      };
    }

    if (want("business")) {
      out.business = {
        websiteUrl: client.websiteUrl ?? null,
        websiteType: client.websiteType ?? null,
        businessType: client.businessType ?? null,
        targetLocation: client.targetLocation ?? null,
      };
    }

    if (want("locations")) {
      out.locations = {
        hasPhysicalLocations: client.hasPhysicalLocations ?? null,
        numberOfLocations: client.numberOfLocations ?? null,
        googleMapsUrls: Array.isArray(client.googleMapsUrls)
          ? client.googleMapsUrls.map((u) => ({
              url: u.url ?? null,
              label: u.label ?? null,
            }))
          : [],
      };
    }

    if (want("goals")) {
      out.goals = {
        conversionGoal: client.conversionGoal ?? null,
        secondaryConversionGoal: client.secondaryConversionGoal ?? null,
        clientGoals: client.clientGoals ?? null,
      };
    }

    if (want("notes")) {
      const notes = Array.isArray(client.clientNotes) ? client.clientNotes : [];
      // Most recent first by date string (ISO). Empty / invalid dates sort last.
      const sorted = notes.slice().sort((a, b) => {
        const ta = a.date ? Date.parse(a.date) : 0;
        const tb = b.date ? Date.parse(b.date) : 0;
        return tb - ta;
      });
      out.notes = {
        totalCount: notes.length,
        returned: Math.min(sorted.length, limit),
        items: sorted.slice(0, limit).map((n) => ({
          date: n.date ?? null,
          author: n.author ?? null,
          category: n.category ?? null,
          content: n.content ?? null,
        })),
      };
    }

    if (want("timeline")) {
      const timeline = Array.isArray(client.accountTimeline) ? client.accountTimeline : [];
      const sorted = timeline.slice().sort((a, b) => {
        const ta = a.date ? Date.parse(a.date) : 0;
        const tb = b.date ? Date.parse(b.date) : 0;
        return tb - ta;
      });
      out.timeline = {
        totalCount: timeline.length,
        returned: Math.min(sorted.length, limit),
        entries: sorted.slice(0, limit).map((e) => ({
          date: e.date ?? null,
          serviceArea: e.serviceArea ?? null,
          actionType: e.actionType ?? null,
          description: e.description ?? null,
        })),
      };
    }

    return {
      ok: true,
      data: {
        groupsReturned: all ? ["all"] : groups,
        client: out,
      },
    };
  },
};
