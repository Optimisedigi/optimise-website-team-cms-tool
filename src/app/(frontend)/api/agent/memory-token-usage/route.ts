import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { headers as nextHeaders } from "next/headers";
import config from "@/payload.config";
import { computeMemoryTokenUsage } from "@/lib/agents/optimate-google-ads/memory-loader";

/**
 * GET /api/agent/memory-token-usage
 *
 * Returns the estimated token cost of the agent-memory + agent-soul block that
 * is injected into EVERY OptiMate prompt (excluding the base system prompt).
 * Powers the "what every prompt costs" panel under Agent > OptiMate Settings.
 *
 * Scope is global/unscoped: it reports the pinned facts (importance ≥ 80) that
 * load in every chat plus all soul aspects — the floor every conversation pays.
 * Per-client chats may pin a few extra client-scoped facts on top.
 *
 * Auth: requires a logged-in CMS admin (memory/soul are admin-only).
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
    const usage = await computeMemoryTokenUsage([]);
    return NextResponse.json({
      memoryTokens: usage.memoryTokens,
      soulTokens: usage.soulTokens,
      totalTokens: usage.totalTokens,
      pinnedFactCount: usage.pinnedFactCount,
      soulAspectCount: usage.soulAspectCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to compute token usage" },
      { status: 500 },
    );
  }
}
