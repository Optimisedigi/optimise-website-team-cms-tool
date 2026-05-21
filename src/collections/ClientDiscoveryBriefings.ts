import type { CollectionConfig, CollectionBeforeChangeHook } from "payload";
import { hasValidApiKey } from "./api-key-access";
import {
  canAccessOrApiKey,
  adminOnlyDelete,
} from "../lib/access";
import {
  buildDiscoveryBriefingMarkdown,
  // type-only import via the namespace below to avoid creating a runtime cycle
} from "../lib/discovery-briefing/markdown";
import type { DiscoveryBriefingState } from "../lib/discovery-briefing/types";

/**
 * Regenerate the canonical markdown blob whenever `data` is present so the
 * stored markdown is always consistent with the structured answers — and so
 * downstream consumers (LLM agents, proposal builder) never see drift.
 *
 * Also derives `title` from the briefing's `businessName` (preferred) so
 * the admin list and `useAsTitle` render something useful even when the
 * sidebar relationships are blank.
 */
const syncMarkdownAndTitle: CollectionBeforeChangeHook = ({ data }) => {
  if (!data) return data;

  const state = data.data as DiscoveryBriefingState | undefined;
  if (state && typeof state === "object") {
    try {
      data.markdown = buildDiscoveryBriefingMarkdown(state);
    } catch {
      // If `data.data` is partially-shaped (e.g. mid-edit), don't block the
      // save — leave `markdown` as the previous value.
    }
  }

  // Title auto-derivation: prefer businessName from the structured state.
  // Callers can still override `title` explicitly if they want.
  const businessName =
    state && typeof state.businessName === "string"
      ? state.businessName.trim()
      : "";
  if (businessName) {
    data.title = businessName;
  } else if (!data.title) {
    data.title = "Untitled discovery briefing";
  }

  return data;
};

export const ClientDiscoveryBriefings: CollectionConfig = {
  slug: "client-discovery-briefings",
  labels: {
    singular: "Client Discovery Briefing",
    plural: "Client Discovery Briefings",
  },
  admin: {
    useAsTitle: "title",
    group: "Clients",
    defaultColumns: ["title", "client", "clientProposal", "updatedAt"],
    description:
      "Pre-meeting client discovery questionnaire (website & SEO strategy). Stores the structured answers plus a canonical rendered markdown blob.",
    // Surfaced exclusively via the Discovery Briefing tab on Clients and
    // ClientProposals — not a standalone sidebar entry. The collection is
    // still reachable via direct URL and the by-scope API for the form.
    hidden: true,
  },
  access: {
    read: canAccessOrApiKey("client-proposals", hasValidApiKey),
    create: canAccessOrApiKey("client-proposals", hasValidApiKey),
    update: canAccessOrApiKey("client-proposals", hasValidApiKey),
    delete: adminOnlyDelete,
  },
  hooks: {
    beforeChange: [syncMarkdownAndTitle],
  },
  fields: [
    {
      name: "title",
      type: "text",
      admin: {
        description:
          "Auto-derived from `data.businessName` on save (or set manually).",
      },
    },
    {
      name: "data",
      type: "json",
      admin: {
        description:
          "Structured questionnaire state — matches DEFAULT_STATE shape from public/client-discovery-briefing.html (sections 1–11). On save, `markdown` is regenerated from this object.",
      },
    },
    {
      name: "markdown",
      type: "textarea",
      admin: {
        description:
          "Canonical rendered markdown. Auto-generated from `data` on every save by a beforeChange hook — edits made here will be overwritten the next time the briefing is saved.",
        readOnly: true,
        rows: 30,
      },
    },
    // ── Sidebar ──
    {
      name: "client",
      type: "relationship",
      relationTo: "clients",
      admin: {
        position: "sidebar",
        description: "Link to existing client (optional).",
      },
    },
    {
      name: "clientProposal",
      type: "relationship",
      relationTo: "client-proposals",
      admin: {
        position: "sidebar",
        description: "Link to client proposal (optional).",
      },
    },
  ],
  timestamps: true,
};
