/**
 * Tool: request_confirm
 *
 * Confirm-gate. Before the agent calls `propose_campaign_restructure` or
 * `propose_campaign_build` \u2014 the two heaviest propose tools that kick off
 * multi-minute Growth Tools runs or push structure to Google Ads on apply
 * \u2014 it MUST call this tool first.
 *
 * No side effects, no DB writes. Returns a structured payload the chat route
 * surfaces alongside the assistant reply. The chat client renders a Yes/No
 * bubble; clicking Yes sends a synthetic follow-up message telling the agent
 * to proceed.
 */

import type { CanonicalTool } from "@/lib/agents/_shared/tool";

type ProposalType = "campaign-restructure" | "campaign-build";

interface RequestConfirmArgs {
  proposalType: ProposalType;
  wording: string;
  summary: string;
  draftSettings: Record<string, unknown>;
}

const VALID_PROPOSAL_TYPES: ReadonlySet<ProposalType> = new Set<ProposalType>([
  "campaign-restructure",
  "campaign-build",
]);

export const requestConfirmTool: CanonicalTool<RequestConfirmArgs> = {
  name: "request_confirm",
  description:
    "Confirm-gate: surface a Yes/No bubble to the user before calling propose_campaign_restructure or propose_campaign_build. " +
    "MUST be called before either of those two propose tools \u2014 they kick off heavy multi-minute runs and the user has to actively reject an over-eager propose call otherwise. " +
    "Pass `proposalType` ('campaign-restructure' | 'campaign-build'), the `wording` shown next to the Yes/No buttons (e.g. 'Want me to restructure the campaigns for approval?'), a short `summary` for your own reference, and the `draftSettings` you would pass to the actual propose call. " +
    "Returns a confirmId. After the user clicks Yes the chat route emits a synthetic 'user confirmed' message and you proceed to the propose tool. " +
    "Other propose tools do NOT need this gate \u2014 call them directly.",
  inputSchema: {
    type: "object",
    properties: {
      proposalType: {
        type: "string",
        enum: ["campaign-restructure", "campaign-build"],
        description: "Which propose tool you intend to call after confirmation.",
      },
      wording: {
        type: "string",
        minLength: 10,
        maxLength: 240,
        description:
          "Sentence shown next to the Yes/No buttons. Use the canonical wording: 'Want me to restructure the campaigns for approval?' or 'Want me to build the campaigns for approval?'.",
      },
      summary: {
        type: "string",
        minLength: 10,
        maxLength: 800,
        description: "1\u20133-sentence overview of what you would propose, mirrors the propose tool's summary arg.",
      },
      draftSettings: {
        type: "object",
        description:
          "The settings object you would pass to the propose tool (e.g. proposalSettings for campaign-restructure). Stored on the confirm request so the synthetic follow-up can replay them verbatim.",
        additionalProperties: true,
      },
    },
    required: ["proposalType", "wording", "summary", "draftSettings"],
    additionalProperties: false,
  },
  validate: (raw) => {
    if (!raw || typeof raw !== "object") throw new Error("input must be an object");
    const obj = raw as Record<string, unknown>;
    const proposalType = obj.proposalType;
    if (typeof proposalType !== "string" || !VALID_PROPOSAL_TYPES.has(proposalType as ProposalType)) {
      throw new Error(
        "proposalType must be one of: campaign-restructure, campaign-build",
      );
    }
    const wording = String(obj.wording ?? "").trim();
    if (wording.length < 10) throw new Error("wording must be at least 10 characters");
    if (wording.length > 240) throw new Error("wording must be 240 characters or fewer");
    const summary = String(obj.summary ?? "").trim();
    if (summary.length < 10) throw new Error("summary must be at least 10 characters");
    if (summary.length > 800) throw new Error("summary must be 800 characters or fewer");
    const draftSettings = obj.draftSettings;
    if (!draftSettings || typeof draftSettings !== "object" || Array.isArray(draftSettings)) {
      throw new Error("draftSettings must be an object");
    }
    return {
      proposalType: proposalType as ProposalType,
      wording,
      summary,
      draftSettings: draftSettings as Record<string, unknown>,
    };
  },
  execute: async (args) => {
    const confirmId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `confirm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return {
      ok: true,
      data: {
        confirmId,
        proposalType: args.proposalType,
        wording: args.wording,
        summary: args.summary,
        draftSettings: args.draftSettings,
      },
    };
  },
};
