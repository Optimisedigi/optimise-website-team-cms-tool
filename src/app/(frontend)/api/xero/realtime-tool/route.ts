import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";
import { executeMemoryTool, executeTool, getInvoiceRealtimeTools, MEMORY_TOOL_NAMES } from "../chat/route";

export const runtime = "nodejs";

const INVOICE_VOICE_TOOL_NAMES = new Set(getInvoiceRealtimeTools().map((tool) => tool.name));

async function executeInvoiceGrowthTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const growthUrl = process.env.GROWTH_TOOLS_URL;
  const apiKey = process.env.INTERNAL_API_KEY;
  if (!growthUrl || !apiKey) return { error: "Growth Tools not configured" };
  return executeTool(name, args, growthUrl, apiKey);
}

/**
 * POST /api/xero/realtime-tool
 *
 * Server-side tool bridge for InvoiceMate voice. The browser forwards Realtime
 * function calls; this route re-authenticates and executes only the same Xero
 * tools the text InvoiceMate chat already exposes.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (!userHasFeature(user, "nav:invoices")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      arguments?: unknown;
    } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
    }
    if (!INVOICE_VOICE_TOOL_NAMES.has(name)) {
      return NextResponse.json(
        { ok: false, error: `Tool "${name}" is not available to InvoiceMate voice.` },
        { status: 403 },
      );
    }

    const args =
      body?.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments)
        ? (body.arguments as Record<string, unknown>)
        : {};

    const result = MEMORY_TOOL_NAMES.has(name)
      ? await executeMemoryTool(name, args, user.id)
      : await executeInvoiceGrowthTool(name, args);
    if (result && typeof result === "object" && "error" in result) {
      return NextResponse.json({ ok: false, error: String((result as { error: unknown }).error), data: result });
    }
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    console.error("[xero-realtime-tool] error:", err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message || "Tool execution failed" },
      { status: 500 },
    );
  }
}
