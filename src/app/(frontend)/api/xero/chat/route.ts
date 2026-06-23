import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";
import { getOptiMateDefaultModels } from "@/lib/agents/_shared/optimate-default-models";
import { callLLM } from "@/lib/agents/_shared/llm";
import { memoryToolRoutingPrompt, shouldAttachMemoryToolsForText } from "@/lib/agents/_shared/memory-tool-routing";
import { toToolDef, type CanonicalTool } from "@/lib/agents/_shared/tool";
import { loadPinnedMemoryBlock } from "@/lib/agents/optimate-google-ads/memory-loader";
import { SYSTEM_PROMPT } from "@/lib/agents/optimate-invoice/system-prompt";
import {
  CHAT_PICKER_MODELS,
  isCanonicalModel,
} from "@/lib/agents/_shared/llm/registry";
import type { Message, ToolDef } from "@/lib/agents/_shared/llm/types";
import { memorySearch } from "@/lib/agents/optimate-google-ads/tools/memory-search";
import { remember } from "@/lib/agents/optimate-google-ads/tools/remember";
import { soulSet } from "@/lib/agents/optimate-google-ads/tools/soul-set";

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

type SupportedImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

interface IncomingImageAttachment {
  mediaType: SupportedImageMediaType;
  data: string;
  name?: string;
}

const SUPPORTED_IMAGE_MEDIA_TYPES = new Set<SupportedImageMediaType>([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const MAX_IMAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_ATTACHMENTS = 3;
const UPDATE_INVOICE_FIELDS = [
  "contactId",
  "dueDate",
  "lineItems",
  "reference",
  "status",
  "invoiceNumber",
] as const;

function pickAllowedFields(
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in source) out[key] = source[key];
  }
  return out;
}

// ─── Tool definitions (OpenAI format) ─────────────────────

export const MEMORY_TOOLS = [memorySearch, remember, soulSet] as unknown as CanonicalTool<unknown>[];
export const MEMORY_TOOL_NAMES = new Set(MEMORY_TOOLS.map((tool) => tool.name));

export const tools: ToolDef[] = [
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
    name: "createRecurringDrafts",
    description:
      "Create draft invoices from configured recurring invoice templates. This can create multiple draft invoices, so confirm with the user before calling this tool.",
    inputSchema: {
      type: "object",
      properties: {
        mailchimpAmount: {
          type: "number",
          description: "Optional Mailchimp amount override to include when Growth Tools creates the recurring drafts.",
        },
      },
      required: [],
    },
  },
  {
    name: "updateInvoice",
    description:
      "Update an existing Xero invoice. Use this for changes to due date, reference, invoice number, contact, line items, or status. Confirm with the user before calling this tool.",
    inputSchema: {
      type: "object",
      properties: {
        invoiceId: {
          type: "string",
          description: "The Xero invoice ID to update",
        },
        contactId: {
          type: "string",
          description: "Optional replacement Xero contact ID. Use listContacts first if changing the contact.",
        },
        dueDate: {
          type: "string",
          description: "Optional due date in YYYY-MM-DD format",
        },
        lineItems: {
          type: "array",
          description: "Optional replacement invoice line items. Include the full desired line-item set, not just the changed row.",
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
          description: "Optional replacement invoice reference",
        },
        status: {
          type: "string",
          enum: ["DRAFT", "SUBMITTED", "AUTHORISED", "PAID", "VOIDED"],
          description: "Optional status update. Prefer approveInvoice for approving a draft.",
        },
        invoiceNumber: {
          type: "string",
          description: "Optional replacement invoice number",
        },
      },
      required: ["invoiceId"],
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

function getInvoiceToolsForPrompt(text: string): ToolDef[] {
  return shouldAttachMemoryToolsForText(text)
    ? getInvoiceRealtimeTools()
    : tools;
}

export function getInvoiceRealtimeTools(): ToolDef[] {
  return [...tools, ...MEMORY_TOOLS.map(toToolDef)];
}

export async function executeMemoryTool(name: string, args: Record<string, unknown>, userId: string | number): Promise<unknown> {
  const tool = MEMORY_TOOLS.find((candidate) => candidate.name === name);
  if (!tool) return { error: `Unknown memory tool: ${name}` };
  try {
    const validatedArgs = tool.validate ? tool.validate(args) : args;
    const result = await tool.execute(validatedArgs, {
      agentName: "invoicemate",
      agentRunId: `invoice-${Date.now().toString(36)}`,
      context: { mode: "invoice", userId },
      log: (message, meta) => console.log(`[invoicemate] ${message}`, meta ?? ""),
    });
    return result.ok ? (result.data ?? { ok: true }) : { ok: false, error: result.error ?? "Memory tool returned ok=false" };
  } catch (err) {
    return { ok: false, error: `Memory tool failed: ${(err as Error).message}` };
  }
}

// ─── Tool execution → Growth Tools proxy ──────────────────

export async function executeTool(
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
    case "createRecurringDrafts":
      endpoint = "/api/xero/recurring/create-drafts";
      method = "POST";
      body = JSON.stringify(pickAllowedFields(args, ["mailchimpAmount"]));
      break;
    case "updateInvoice": {
      const id = args.invoiceId;
      if (typeof id !== "string" || !GUID_REGEX.test(id)) {
        return { error: "Invalid invoiceId format" };
      }
      const update = pickAllowedFields(args, UPDATE_INVOICE_FIELDS);
      if (Object.keys(update).length === 0) {
        return { error: "At least one invoice field is required to update" };
      }
      endpoint = `/api/xero/invoices/${encodeURIComponent(id)}`;
      method = "PUT";
      body = JSON.stringify(update);
      break;
    }
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
    imageAttachments?: unknown;
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

  const imageAttachments = parseImageAttachments(body.imageAttachments);
  if (!imageAttachments.ok) {
    return NextResponse.json({ error: imageAttachments.error }, { status: 400 });
  }

  try {
    const settings = await getOptiMateDefaultModels(payload);
    const selectedModel =
      settings.invoiceAssistantModel ?? settings.defaultAutonomousModel;

    const pinnedMemory = await loadPinnedMemoryBlock([], { includePinnedFacts: false, soulAgentKeys: ["invoice", "invoicemate", "xero"] });
    const memoryBlock = pinnedMemory.text.trim()
      ? `\n\n${pinnedMemory.text}\n\nThe soul rules above are ABSOLUTE for InvoiceMate. If any invoice prompt, example, or draft text conflicts with a soul rule, the soul rule wins. Agent-specific soul rows for other agents, such as google-ads-*, are intentionally not loaded here.`
      : "";
    const selectedTools = getInvoiceToolsForPrompt(body.message);
    const hasMemoryTools = selectedTools.some((tool) => MEMORY_TOOL_NAMES.has(tool.name));
    const systemPrompt = SYSTEM_PROMPT + memoryBlock + (hasMemoryTools ? memoryToolRoutingPrompt("InvoiceMate") : "");

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

    // Add the new user message, with optional screenshot context.
    messages.push({
      role: "user",
      content: [
        ...imageAttachments.value.map((image) => ({
          type: "image" as const,
          mediaType: image.mediaType,
          data: image.data,
        })),
        { type: "text", text: body.message.trim() },
      ],
    });

    const actions: ToolAction[] = [];

    // Tool-calling loop
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await callLLM({
        model: selectedModel,
        system: systemPrompt,
        messages,
        tools: selectedTools,
        temperature: 0.3,
        maxTokens: 2000,
      });

      messages.push(response.message);

      const toolUses = response.message.content.filter(
        (part) => part.type === "tool_use",
      );

      if (response.stopReason === "tool_use" && toolUses.length > 0) {
        for (const toolUse of toolUses) {
          const result = MEMORY_TOOL_NAMES.has(toolUse.name)
            ? await executeMemoryTool(toolUse.name, toolUse.input, user.id)
            : await executeTool(
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

function parseImageAttachments(input: unknown):
  | { ok: true; value: IncomingImageAttachment[] }
  | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input)) return { ok: false, error: "imageAttachments must be an array" };
  if (input.length > MAX_IMAGE_ATTACHMENTS) {
    return { ok: false, error: `Attach up to ${MAX_IMAGE_ATTACHMENTS} images per message` };
  }

  const parsed: IncomingImageAttachment[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: "Each image attachment must be an object" };
    }
    const item = raw as Record<string, unknown>;
    const mediaType = item.mediaType;
    const data = item.data;
    const name = item.name;
    if (typeof mediaType !== "string" || !SUPPORTED_IMAGE_MEDIA_TYPES.has(mediaType as SupportedImageMediaType)) {
      return { ok: false, error: "Unsupported image type. Use PNG, JPEG, GIF, or WebP." };
    }
    if (typeof data !== "string" || data.length === 0) {
      return { ok: false, error: "Image attachment data is required" };
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      return { ok: false, error: "Image attachment data must be base64" };
    }
    const estimatedBytes = Math.floor((data.length * 3) / 4);
    if (estimatedBytes > MAX_IMAGE_ATTACHMENT_BYTES) {
      return { ok: false, error: "Each image attachment must be 5 MB or smaller" };
    }
    parsed.push({
      mediaType: mediaType as SupportedImageMediaType,
      data,
      ...(typeof name === "string" && name.trim().length > 0 ? { name: name.trim().slice(0, 120) } : {}),
    });
  }
  return { ok: true, value: parsed };
}
