import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import { estimateTokens } from "@/lib/agents/_shared/token-estimate";
import { toToolDef, type CanonicalTool } from "@/lib/agents/_shared/tool";
import type { Message, ToolDef } from "@/lib/agents/_shared/llm/types";
import {
  buildSystemPromptForAudit,
  buildSystemPromptForPortfolio,
} from "@/lib/agents/optimate-google-ads/config";
import { getGoogleMateInitialTools, getPortfolioTools, getTools } from "@/lib/agents/optimate-google-ads";
import { buildEmailReplySystemPrompt, getEmailTools } from "@/lib/agents/optimate-email";
import { buildInvoiceMateSystemPrompt } from "@/lib/agents/optimate-invoice/system-prompt";
import { tools as invoiceTools } from "@/app/(frontend)/api/xero/chat/route";

const SAMPLE_AUDIT = {
  id: "EXAMPLE_AUDIT_ID",
  businessName: "Example Business",
  customerId: "123-456-7890",
  monthlySpend: 10000,
  brandTerms: "example, example brand",
};

const SAMPLE_CLIENT = {
  id: "EXAMPLE_CLIENT_ID",
  name: "Example Client",
  dashboardConversionActions: "Phone call, Form submit",
  conversionActionCategories: [
    { label: "Leads", color: "blue", actions: "Phone call, Form submit" },
  ],
};

const SAMPLE_FLAGS = {
  ga4Connected: true,
  ga4PropertyId: "GA4_PROPERTY_ID",
  gscConnected: true,
  gscPropertyUrl: "https://example.com/",
};

const GOOGLEMATE_PROMPT_SOURCE_PATHS = [
  "src/lib/agents/optimate-google-ads/config.ts",
  "src/lib/agents/_shared/system-prompt-builder.ts",
  "src/lib/agents/_shared/tone-of-voice.md",
  "src/lib/agents/optimate-google-ads/memory-loader.ts",
];

const GOOGLEMATE_TOOL_SOURCE_PATHS = [
  "src/lib/agents/optimate-google-ads/index.ts",
  "src/lib/agents/optimate-google-ads/tools/",
  "src/lib/agents/_shared/memory-tool-routing.ts",
];

const INVOICE_PROMPT_SOURCE_PATHS = ["src/lib/agents/optimate-invoice/system-prompt.ts"];
const INVOICE_TOOL_SOURCE_PATHS = [
  "src/app/(frontend)/api/xero/chat/route.ts",
  "src/lib/agents/optimate-invoice/",
];
const GMAIL_PROMPT_SOURCE_PATHS = [
  "src/lib/agents/optimate-email/index.ts",
  "src/lib/agents/_shared/system-prompt-builder.ts",
  "src/lib/agents/_shared/tone-of-voice.md",
];
const GMAIL_TOOL_SOURCE_PATHS = [
  "src/lib/agents/optimate-email/index.ts",
  "src/lib/agents/optimate-email/tools/",
];

function userMessage(text: string): Message {
  return { role: "user", content: [{ type: "text", text }] };
}

function summarisePrompt(label: string, description: string, prompt: string, sourcePaths: string[]) {
  return {
    label,
    description,
    sourcePaths,
    characters: prompt.length,
    estimatedTokens: estimateTokens(prompt),
  };
}

function schemaOnlyTools(tools: Array<ToolDef | CanonicalTool<unknown>>): ToolDef[] {
  return tools.map((tool) => {
    if ("inputSchema" in tool && "execute" in tool) {
      return toToolDef(tool as CanonicalTool<unknown>);
    }
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    };
  });
}

function summariseToolSchemas(label: string, description: string, tools: Array<ToolDef | CanonicalTool<unknown>>, sourcePaths: string[]) {
  const toolDefs = schemaOnlyTools(tools);
  const schemaJson = JSON.stringify(toolDefs);
  return {
    label,
    description,
    sourcePaths,
    toolCount: toolDefs.length,
    characters: schemaJson.length,
    estimatedTokens: estimateTokens(schemaJson),
  };
}

/**
 * GET /api/agent/system-prompt-token-usage
 *
 * Returns live heuristic token estimates for the OptiMate base system prompts.
 * This is local string counting only, so opening the settings page does not call
 * an LLM and does not spend model tokens.
 */
export async function GET() {
  const payload = await getPayload({ config });
  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const genericAuditPrompt = buildSystemPromptForAudit(SAMPLE_AUDIT, SAMPLE_CLIENT, SAMPLE_FLAGS, {
      recentMessages: [],
    });
    const geoAuditPrompt = buildSystemPromptForAudit(SAMPLE_AUDIT, SAMPLE_CLIENT, SAMPLE_FLAGS, {
      recentMessages: [userMessage("build a new campaign structure based on the website")],
    });
    const scheduledAuditPrompt = buildSystemPromptForAudit(SAMPLE_AUDIT, SAMPLE_CLIENT, SAMPLE_FLAGS, {
      recentMessages: [userMessage("send me a weekly recap every Monday")],
    });
    const allGuidesAuditPrompt = buildSystemPromptForAudit(SAMPLE_AUDIT, SAMPLE_CLIENT, SAMPLE_FLAGS);
    const portfolioPrompt = buildSystemPromptForPortfolio({ recentMessages: [] });

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      estimator: "heuristic_chars_divided_by_4",
      note:
        "Approximate visible system-prompt tokens only. Real request input also includes current user text, selected chat history, runtime memory/client context, and the enabled tool schema JSON. Tool schemas are sent as extra request input so the model knows callable tool names/parameters; they are separate from tool result payloads returned after a tool runs.",
      prompts: [
        summarisePrompt(
          "GoogleMate generic audit chat",
          "Normal GoogleMate audit prompt with always-on guides and no heavy workflow triggers.",
          genericAuditPrompt,
          GOOGLEMATE_PROMPT_SOURCE_PATHS,
        ),
        summarisePrompt(
          "GoogleMate geo/campaign workflow",
          "GoogleMate audit prompt when campaign structure or geo workflow keywords trigger GEO_WALKTHROUGH.",
          geoAuditPrompt,
          GOOGLEMATE_PROMPT_SOURCE_PATHS,
        ),
        summarisePrompt(
          "GoogleMate scheduled/deck workflow",
          "GoogleMate audit prompt when recurring report/deck-style keywords trigger scheduled and deck guides.",
          scheduledAuditPrompt,
          GOOGLEMATE_PROMPT_SOURCE_PATHS,
        ),
        summarisePrompt(
          "GoogleMate all guides legacy",
          "Back-compat GoogleMate prompt when callers omit recentMessages, includes every heavy guide.",
          allGuidesAuditPrompt,
          GOOGLEMATE_PROMPT_SOURCE_PATHS,
        ),
        summarisePrompt(
          "GoogleMate portfolio chat",
          "Portfolio-mode GoogleMate prompt for cross-account Google Ads questions.",
          portfolioPrompt,
          GOOGLEMATE_PROMPT_SOURCE_PATHS,
        ),
        summarisePrompt(
          "InvoiceMate base prompt",
          "Separate lightweight Xero invoice assistant prompt before optional memory and tool schemas.",
          buildInvoiceMateSystemPrompt(),
          INVOICE_PROMPT_SOURCE_PATHS,
        ),
        summarisePrompt(
          "GmailMate base prompt",
          "Separate Gmail/email-reply assistant prompt before optional memory and tool schemas.",
          buildEmailReplySystemPrompt(),
          GMAIL_PROMPT_SOURCE_PATHS,
        ),
      ],
      toolSchemas: [
        summariseToolSchemas(
          "GoogleMate generic audit initial tool schemas",
          "Lean JSON definitions attached to a blank generic GoogleMate audit chat before any specialist bundle is requested.",
          getGoogleMateInitialTools([]),
          GOOGLEMATE_TOOL_SOURCE_PATHS,
        ),
        summariseToolSchemas(
          "GoogleMate geo/campaign initial tool schemas",
          "Initial JSON definitions attached when geo or campaign-structure keywords pre-load only the campaign_build bundle.",
          getGoogleMateInitialTools([userMessage("geo split")]),
          GOOGLEMATE_TOOL_SOURCE_PATHS,
        ),
        summariseToolSchemas(
          "GoogleMate scheduled/deck initial tool schemas",
          "Initial JSON definitions attached when scheduled report and deck keywords pre-load only those bundles.",
          getGoogleMateInitialTools([userMessage("schedule a stakeholder deck")]),
          GOOGLEMATE_TOOL_SOURCE_PATHS,
        ),
        summariseToolSchemas(
          "GoogleMate full audit tool schemas",
          "Legacy JSON definitions for the complete audit-mode GoogleMate tool set, including names, descriptions, and input schemas. This is larger than the blank-chat initial route set and excludes any later tool results.",
          getTools({ attachMemoryTools: true }),
          GOOGLEMATE_TOOL_SOURCE_PATHS,
        ),
        summariseToolSchemas(
          "GoogleMate portfolio tool schemas",
          "JSON definitions for portfolio-mode GoogleMate tools. Added as request input for portfolio chats; excludes any later tool results.",
          getPortfolioTools({ attachMemoryTools: true }),
          GOOGLEMATE_TOOL_SOURCE_PATHS,
        ),
        summariseToolSchemas(
          "InvoiceMate tool schemas",
          "JSON definitions for Xero/InvoiceMate chat tools. Added as request input for InvoiceMate chats; excludes any later Growth Tools/Xero responses.",
          invoiceTools,
          INVOICE_TOOL_SOURCE_PATHS,
        ),
        summariseToolSchemas(
          "GmailMate tool schemas",
          "JSON definitions for GmailMate email tools. Added as request input for GmailMate chats; excludes any later Gmail/message tool results.",
          getEmailTools({ attachMemoryTools: true }),
          GMAIL_TOOL_SOURCE_PATHS,
        ),
      ],
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to compute system prompt token usage" },
      { status: 500 },
    );
  }
}
