import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";

// Xero invoice IDs are GUIDs. Same validation as /api/xero/actions —
// rejects path-traversal payloads and query-string hoists before the
// value is spliced into a URL path segment.
const GUID_REGEX = /^[0-9a-fA-F-]{36}$/;

// ─── Env ──────────────────────────────────────────────────

const KIMI_BASE_URL =
  process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1";
const KIMI_MODEL = process.env.KIMI_MODEL || "kimi-k2-0905-preview";
const MAX_TOOL_ITERATIONS = 5;

// ─── Types ────────────────────────────────────────────────

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ToolAction {
  tool: string;
  result: unknown;
}

// ─── Tool definitions (OpenAI format) ─────────────────────

const tools = [
  {
    type: "function" as const,
    function: {
      name: "listContacts",
      description:
        "Search or list Xero contacts (clients). Use to look up a contact by name before creating an invoice.",
      parameters: {
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
  },
  {
    type: "function" as const,
    function: {
      name: "listInvoices",
      description:
        "List Xero invoices with optional filters. Returns invoice details including status, amounts, and due dates.",
      parameters: {
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
  },
  {
    type: "function" as const,
    function: {
      name: "getInvoiceSummary",
      description:
        "Get a summary of outstanding and overdue invoices — totals, counts, and recent unpaid invoices.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "createInvoice",
      description:
        "Create a new Xero invoice. Requires a contact ID, at least one line item, and a due date. Creates as DRAFT by default.",
      parameters: {
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
  },
  {
    type: "function" as const,
    function: {
      name: "approveInvoice",
      description:
        "Approve a draft invoice, changing its status to AUTHORISED so it can be sent.",
      parameters: {
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
  },
  {
    type: "function" as const,
    function: {
      name: "sendInvoice",
      description:
        "Send an invoice to the client via email. Automatically approves if still in DRAFT status.",
      parameters: {
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
  },
  {
    type: "function" as const,
    function: {
      name: "scheduleSend",
      description:
        "Schedule an invoice to be automatically sent on a future date.",
      parameters: {
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
  },
  {
    type: "function" as const,
    function: {
      name: "getScheduledSends",
      description: "List all invoices currently scheduled for future sending.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
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

  const KIMI_API_KEY = process.env.KIMI_API_KEY;
  const GROWTH_TOOLS_URL = process.env.GROWTH_TOOLS_URL;
  const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

  if (!KIMI_API_KEY) {
    return NextResponse.json(
      { error: "KIMI_API_KEY not configured" },
      { status: 500 }
    );
  }
  if (!GROWTH_TOOLS_URL || !INTERNAL_API_KEY) {
    return NextResponse.json(
      { error: "Growth Tools not configured" },
      { status: 500 }
    );
  }

  let body: {
    message: string;
    history?: Array<{ role: string; content: string }>;
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
    // Build conversation messages
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // Add conversation history
    if (body.history?.length) {
      for (const msg of body.history) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    // Add the new user message
    messages.push({ role: "user", content: body.message.trim() });

    const actions: ToolAction[] = [];

    // Tool-calling loop
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const kimiRes = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${KIMI_API_KEY}`,
        },
        body: JSON.stringify({
          model: KIMI_MODEL,
          messages,
          tools,
          temperature: 0.3,
          max_tokens: 2000,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!kimiRes.ok) {
        const detail = await kimiRes.text().catch(() => "");
        console.error(`[xero/chat] Kimi API error ${kimiRes.status}: ${detail}`);
        return NextResponse.json(
          { error: `AI service error: ${kimiRes.status}` },
          { status: 502 }
        );
      }

      const kimiData = await kimiRes.json();
      const choice = kimiData.choices?.[0];

      if (!choice) {
        return NextResponse.json(
          { error: "AI returned no response" },
          { status: 502 }
        );
      }

      const assistantMsg = choice.message;

      // If the model wants to call tools
      if (
        choice.finish_reason === "tool_calls" &&
        assistantMsg.tool_calls?.length
      ) {
        // Add the assistant message (with tool_calls) to the conversation
        messages.push({
          role: "assistant",
          content: assistantMsg.content || null,
          tool_calls: assistantMsg.tool_calls,
        });

        // Execute each tool call and add results
        for (const tc of assistantMsg.tool_calls) {
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch {
            args = {};
          }

          const result = await executeTool(
            tc.function.name,
            args,
            GROWTH_TOOLS_URL,
            INTERNAL_API_KEY
          );

          actions.push({ tool: tc.function.name, result });

          messages.push({
            role: "tool",
            content: JSON.stringify(result),
            tool_call_id: tc.id,
          });
        }

        // Continue the loop — Kimi will process the tool results
        continue;
      }

      // Model returned a text response — we're done
      const reply =
        assistantMsg.content?.trim() || "I couldn't generate a response.";
      return NextResponse.json({ reply, actions });
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
