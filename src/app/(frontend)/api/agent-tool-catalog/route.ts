import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { buildGoalCatalog, buildSuggestedPromptCatalog, buildToolCatalog, totalToolCount } from "@/lib/agents/optimate-google-ads/tool-catalog";

/**
 * GET /api/agent-tool-catalog?agent=optimate-google-ads
 *
 * Returns a grouped, human-readable catalog of every tool the agent has
 * registered. Used by the in-chat "?" popover. Auth: any logged-in CMS user.
 *
 * Currently only `optimate-google-ads` is supported \u2014 add new agents to the
 * switch as they ship.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent = req.nextUrl.searchParams.get("agent") ?? "optimate-google-ads";

  switch (agent) {
    case "optimate-google-ads": {
      const categories = buildToolCatalog();
      const goals = buildGoalCatalog();
      const suggestedPrompts = buildSuggestedPromptCatalog();
      return NextResponse.json({
        agent,
        toolCount: totalToolCount(),
        goalCount: goals.length,
        categories,
        goals,
        suggestedPrompts,
      });
    }
    default:
      return NextResponse.json({ error: `Unknown agent: ${agent}` }, { status: 400 });
  }
}
