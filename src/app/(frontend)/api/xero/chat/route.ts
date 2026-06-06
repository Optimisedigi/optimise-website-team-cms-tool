import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";
import { getOptiMateDefaultModels } from "@/lib/agents/_shared/optimate-default-models";
import { callLLM } from "@/lib/agents/_shared/llm";
import {
  CHAT_PICKER_MODELS,
  isCanonicalModel,
} from "@/lib/agents/_shared/llm/registry";
import type { Message, ToolDef } from "@/lib/agents/_shared/llm/types";

/** Resolve a client-requested model to a usable canonical name, or undefined
 *  when the value is missing/unknown/not offered in the chat picker. Mirrors
 *  the validation OptiMateChatCore applies before sending its model pick. */
function resolveRequestedModel(value: unknown): string | undefined {
  if (typeof value !== "string" || !isCanonicalModel(value)) return undefined;
  return CHAT_PICKER_MODELS.some((m) => m.canonical === value) ? value : undefined;
}

// Xero invoice IDs are GUIDs. Same validation as /api/xero/actions —
// rejects path-traversal payloads and query-string hoists before the
// value is spliced into a URL path segment.
const GUID_REGEX = /^[0-9a-fA-F-]{36}$/;

// ─── Env ──────────────────────────────────────────────────

const MAX_TOOL_ITERATIONS = 5;

// ─── Types ────────────────────────────────────────────────

interface ToolAction {
  tool: string;
  result: unknown;
}

// ─── Tool definitions (OpenAI format) ─────────────────────

const tools: ToolDef[] = [
  {
    name: "listContacts",
    description:
      "Search or list Xero contacts (clients). Use to look up a contact by name before creating an invoice.",
    inputSchema: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description:
            "Optional search term to filter contacts by name or email",
        },
      },
      required: [],
    },
  },
  {
    name: "listInvoices",
    description:
      "List Xero invoices with optional filters. Returns invoice details including status, amounts, and due dates.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["DRAFT", "SUBMITTED", "AUTHORISED", "PAID", "VOIDED"],
          description: "Filter by invoice status",
        },
        contactId: {
          type: "string",
          description: "Filter by Xero contact ID",
        },
        page: {
          type: "number",
          description: "Page number (default 1)",
        },
      },
      required: [],
    },
  },
  {
    name: "getInvoiceSummary",
    description:
      "Get a summary of outstanding and overdue invoices — totals, counts, and recent unpaid invoices.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "createInvoice",
    description:
      "Create a new Xero invoice. Requires a contact ID, at least one line item, and a due date. Creates as DRAFT by default.",
    inputSchema: {
      type: "object",
      properties: {
        contactId: {
          type: "string",
          description: "Xero contact ID (use listContacts to find it)",
        },
        dueDate: {
          type: "string",
          description: "Due date in YYYY-MM-DD format",
        },
        lineItems: {
          type: "array",
          description: "Invoice line items",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              unitAmount: { type: "number" },
              accountCode: {
                type: "string",
                description: "Xero account code (default: 200 for Sales)",
              },
            },
            required: ["description", "quantity", "unitAmount"],
          },
        },
        reference: {
          type: "string",
          description:
            "Optional reference/description shown on the invoice list",
        },
      },
      required: ["contactId", "dueDate", "lineItems"],
    },
  },
  {
    name: "approveInvoice",
    description:
      "Approve a draft invoice, changing its status to AUTHORISED so it can be sent.",
    inputSchema: {
      type: "object",
      properties: {
        invoiceId: {
          type: "string",
          description: "The Xero invoice ID to approve",
        },
      },
      required: ["invoiceId"],
    },
  },
  {
    name: "sendInvoice",
    description:
      "Send an invoice to the client via email. Automatically approves if still in DRAFT status.",
    inputSchema: {
      type: "object",
      properties: {
        invoiceId: {
          type: "string",
          description: "The Xero invoice ID to send",
        },
      },
      required: ["invoiceId"],
    },
  },
  {
    name: "scheduleSend",
    description:
      "Schedule an invoice to be automatically sent on a future date.",
    inputSchema: {
      type: "object",
      properties: {
        invoiceId: {
          type: "string",
          description: "The Xero invoice ID to schedule",
        },
        sendDate: {
          type: "string",
          description: "Date to send the invoice in YYYY-MM-DD format",
        },
      },
      required: ["invoiceId", "sendDate"],
    },
  },
  {
    name: "getScheduledSends",
    description: "List all invoices currently scheduled for future sending.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// ─── System prompt ─────────────────────────────────────────

const SYSTEM_PROMPT = `You are an invoice assistant for Optimise Digital, a digital marketing agency. You help manage Xero invoices — creating, approving, sending, and scheduling them.

You have access to the following tools to interact with Xero:
- listContacts: Search for clients/contacts
- listInvoices: List invoices with filters
- getInvoiceSummary: Get outstanding/overdue summary
- createInvoice: Create a new invoice
- approveInvoice: Approve a draft invoice
- sendInvoice: Send an invoice via email
- scheduleSend: Schedule an invoice for future sending
- getScheduledSends: List scheduled sends

Guidelines:
- Before creating an invoice, always look up the contact first using listContacts to get the correct contactId.
- When creating invoices, default the account code to "200" (Sales) unless told otherwise.
- For "this month's retainer", use the current month and year in the description.
- Before performing destructive actions (sending, approving), confirm with the user first. Creating a draft is safe and doesn't need confirmation.
- Format currency amounts in AUD.
- Be concise and actionable in your responses. Use ✅ for successful actions and ⚠️ for warnings.
- Today's date is ${new Date().toISOString().split("T")[0]}.`;

// ─── Tool execution → Growth Tools proxy ──────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  growthUrl: string,
  apiKey: string
): Promise<unknown> {
  const headers: Record<string, string> = {
    "x-internal-key": apiKey,
    "Content-Type": "application/json",
  };

  let endpoint: string;
  let method: string;
  let body: string | undefined;

  switch (name) {
    case "listContacts": {
      const params = new URLSearchParams();
      if (args.search) params.set("search", String(args.search));
      endpoint = `/api/xero/contacts${params.toString() ? `?${params}` : ""}`;
      method = "GET";
      break;
    }
    case "listInvoices": {
      const params = new URLSearchParams();
      if (args.status) params.set("status", String(args.status));
      if (args.contactId) params.set("contactId", String(args.contactId));
      if (args.page) params.set("page", String(args.page));
      endpoint = `/api/xero/invoices${params.toString() ? `?${params}` : ""}`;
      method = "GET";
      break;
    }
    case "getInvoiceSummary":
      endpoint = "/api/xero/invoices/summary";
      method = "GET";
      break;
    case "createInvoice":
      endpoint = "/api/xero/invoices";
      method = "POST";
      body = JSON.stringify(args);
      break;
    case "approveInvoice": {
      const id = args.invoiceId;
      if (typeof id !== "string" || !GUID_REGEX.test(id)) {
        return { error: "Invalid invoiceId format" };
      }
      endpoint = `/api/xero/invoices/${encodeURIComponent(id)}/approve`;
      method = "POST";
      break;
    }
    case "sendInvoice": {
      const id = args.invoiceId;
      if (typeof id !== "string" || !GUID_REGEX.test(id)) {
        return { error: "Invalid invoiceId format" };
      }
      endpoint = `/api/xero/invoices/${encodeURIComponent(id)}/send`;
      method = "POST";
      break;
    }
    case "scheduleSend": {
      const id = args.invoiceId;
      if (typeof id !== "string" || !GUID_REGEX.test(id)) {
        return { error: "Invalid invoiceId format" };
      }
      endpoint = `/api/xero/invoices/${encodeURIComponent(id)}/schedule-send`;
      method = "POST";
      body = JSON.stringify({ sendDate: args.sendDate });
      break;
    }
    case "getScheduledSends":
      endpoint = "/api/xero/scheduled-sends";
      method = "GET";
      break;
    default:
      return { error: `Unknown tool: ${name}` };
  }

  const res = await fetch(`${growthUrl}${endpoint}`, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return {
      error: `Growth Tools returned ${res.status}`,
      detail: detail.slice(0, 500),
    };
  }

  return res.json();
}

// ─── POST handler ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Auth gate ──
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!userHasFeature(user, "nav:invoices")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
  const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "Growth Tools not configured" },
      { status: 500 }
    );
  }

  let body: {
    message: string;
    history?: Array<{ role: string; content: string }>;
    model?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.message?.trim()) {
    return NextResponse.json(
      { error: "message is required" },
      { status: 400 }
    );
  }

  try {
    const settings = await getOptiMateDefaultModels(payload);
    const selectedModel =
      settings.invoiceAssistantModel ?? settings.defaultAutonomousModel;

    const messages: Message[] = [];

    // Add conversation history
    if (body.history?.length) {
      for (const msg of body.history) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({
            role: msg.role,
            content: [{ type: "text", text: msg.content }],
          });
        }
      }
    }

    // Add the new user message
    messages.push({
      role: "user",
      content: [{ type: "text", text: body.message.trim() }],
    });

    const actions: ToolAction[] = [];

    // Tool-calling loop
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await callLLM({
        model: selectedModel,
        system: SYSTEM_PROMPT,
        messages,
        tools,
        temperature: 0.3,
        maxTokens: 2000,
      });

      messages.push(response.message);

      const toolUses = response.message.content.filter(
        (part) => part.type === "tool_use",
      );

      if (response.stopReason === "tool_use" && toolUses.length > 0) {
        for (const toolUse of toolUses) {
          const result = await executeTool(
            toolUse.name,
            toolUse.input,
            GROWTH_TOOLS_URL,
            INTERNAL_API_KEY
          );

          actions.push({ tool: toolUse.name, result });

          messages.push({
            role: "tool",
            content: [
              {
                type: "tool_result",
                toolUseId: toolUse.id,
                content: JSON.stringify(result),
              },
            ],
          });
        }

        continue;
      }

      const reply = response.message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("")
        .trim() || "I couldn't generate a response.";
      return NextResponse.json({ reply, actions, model: response.model });
    }

    // If we hit the iteration limit
    return NextResponse.json({
      reply:
        "I needed too many steps to complete that request. Please try a simpler instruction.",
      actions,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Chat request failed";
    console.error("[xero/chat]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
