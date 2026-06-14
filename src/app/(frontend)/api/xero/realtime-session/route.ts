import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";
import { loadPinnedMemoryBlock } from "@/lib/agents/optimate-google-ads/memory-loader";
import { SYSTEM_PROMPT, tools } from "../chat/route";

export const runtime = "nodejs";

/**
 * GET /api/xero/realtime-session
 *
 * Builds the server-owned InvoiceMate Realtime voice session. The browser only
 * receives the prompt/tool definitions; the actual Xero calls still go through
 * /api/xero/realtime-tool with server-side auth and internal Growth Tools keys.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!userHasFeature(user, "nav:invoices")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const pinnedMemory = await loadPinnedMemoryBlock([], {
      includePinnedFacts: false,
      soulAgentKeys: ["invoice", "invoicemate", "xero"],
    });
    const memoryBlock = pinnedMemory.text.trim()
      ? `\n\n${pinnedMemory.text}\n\nThe soul rules above are ABSOLUTE for InvoiceMate. If any invoice prompt, example, or draft text conflicts with a soul rule, the soul rule wins. Agent-specific soul rows for other agents, such as google-ads-*, are intentionally not loaded here.`
      : "";

    const voiceGuardrail =
      "\n\n--- VOICE MODE ---\n" +
      "You are on a live voice call inside InvoiceMate. Keep every spoken reply short and conversational. " +
      "NEVER say, read, spell, or reference tool/function names or their syntax out loud or in the transcript. Use tools silently and speak only plain English. " +
      "Before approving, sending, or scheduling an invoice, ask for explicit confirmation unless the user's latest spoken request already clearly confirmed that exact action and invoice. " +
      "When a tool succeeds, summarize the outcome in one short sentence. When a tool fails, say the problem plainly and do not claim the action was completed.";

    return NextResponse.json({
      instructions: SYSTEM_PROMPT + memoryBlock + voiceGuardrail,
      tools: tools.map((tool) => ({
        type: "function" as const,
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      })),
    });
  } catch (err) {
    console.error("[xero-realtime-session] error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to build InvoiceMate voice session" },
      { status: 500 },
    );
  }
}
