/**
 * Tool: propose_deck_from_template
 *
 * Generic, registry-driven version of propose_stakeholder_deck.
 * Agents specify `templateSlug` + `payload`; on approval the apply
 * handler appends a new entry to the target client's
 * `presentations[]` array. No filesystem writes — works in
 * production.
 */
import type { CanonicalTool } from "@/lib/agents/_shared/tool";
import { queueProposal } from "./_propose-helpers";
import { getTemplate } from "@/lib/decks/registry";

interface ProposeDeckFromTemplateArgs {
  clientId: number;
  templateSlug: string;
  deckSlug: string;
  title: string;
  payload: unknown;
  summary: string;
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const proposeDeckFromTemplateTool: CanonicalTool<ProposeDeckFromTemplateArgs> = {
  name: "propose_deck_from_template",
  description:
    "Queue a deck for human approval. Pick a registered template by slug, supply a typed payload, and on apply the deck is appended to the client's presentations[] and served live at /partners/<clientSlug>/<deckSlug>/.",
  inputSchema: {
    type: "object",
    properties: {
      clientId: { type: "number", description: "Payload Clients doc id" },
      templateSlug: {
        type: "string",
        description:
          "Registered template slug (e.g. 'google-ads-audit-15-slide'). Must exist in src/lib/decks/registry.ts.",
      },
      deckSlug: {
        type: "string",
        description:
          "URL slug for the new presentation (kebab-case). Must be unique within the client's presentations[].",
      },
      title: {
        type: "string",
        description: "Display title for the presentation row in the CMS.",
      },
      payload: {
        type: "object",
        description:
          "Template-specific payload. Will be validated against the template's payloadSchema before queueing.",
      },
      summary: {
        type: "string",
        description: "One-line summary for the approval queue card.",
      },
    },
    required: ["clientId", "templateSlug", "deckSlug", "title", "payload", "summary"],
    additionalProperties: false,
  },
  execute: async (args, ctx) => {
    if (!SLUG_RE.test(args.deckSlug)) {
      return {
        ok: false,
        error: `deckSlug must be kebab-case lowercase; got "${args.deckSlug}".`,
      };
    }

    const template = getTemplate(args.templateSlug);
    if (!template) {
      return {
        ok: false,
        error: `Unknown templateSlug "${args.templateSlug}". Inspect src/lib/decks/registry.ts for the list.`,
      };
    }

    const parsed = template.payloadSchema.safeParse(args.payload);
    if (!parsed.ok) {
      return {
        ok: false,
        error: `payload validation failed: ${parsed.error}`,
      };
    }

    const internalMarkdown = [
      `**Deck proposal: ${args.title}**`,
      ``,
      `- Template: \`${args.templateSlug}\` (${template.name})`,
      `- Client id: ${args.clientId}`,
      `- Will be served at: \`/partners/<client-slug>/${args.deckSlug}/\``,
      ``,
      args.summary,
    ].join("\n");

    const clientHtml = `<iframe src="/partners/_preview/${encodeURIComponent(args.templateSlug)}" style="width:100%;height:80vh;border:0" />`;

    let approvalId: number;
    try {
      approvalId = await queueProposal({
        agentName: ctx.agentName,
        agentRunId: ctx.agentRunId,
        triggeredByUserId: ctx.context.userId as number | undefined,
        proposalType: "deck-from-template",
        title: args.title,
        clientId: args.clientId,
        proposalPayload: {
          clientId: args.clientId,
          templateSlug: args.templateSlug,
          deckSlug: args.deckSlug,
          title: args.title,
          payload: parsed.value,
        },
        rendered: { internalMarkdown, clientHtml },
      });
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    return {
      ok: true,
      data: {
        approvalId,
        approvalUrl: `/agent-approvals/${approvalId}`,
        templateSlug: args.templateSlug,
        deckSlug: args.deckSlug,
      },
    };
  },
};
