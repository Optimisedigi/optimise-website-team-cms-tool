import { NextResponse } from "next/server";
import { createLocalReq, getPayload } from "payload";
import config from "@/payload.config";
import { validateStagedClient } from "@/lib/agents/adminmate";
import { ClientSlugConflictError, createClientFromStaged } from "@/lib/agents/adminmate/create-client";

/**
 * Creates the client the admin confirmed in the AdminMate review card.
 *
 * The staged payload arrives from the browser, so it is re-validated through the
 * same field allowlist the agent used — an edited card can never introduce a
 * field (PIN, GA4 tokens, Google Ads IDs) the agent was not allowed to set.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: request.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((user as { role?: string }).role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  let staged;
  try {
    staged = validateStagedClient(body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid client" }, { status: 400 });
  }

  try {
    const created = await createClientFromStaged(payload, staged, await createLocalReq({ user }, payload));
    return NextResponse.json(created);
  } catch (error) {
    if (error instanceof ClientSlugConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[adminmate/create-client] create failed:", error);
    return NextResponse.json({ error: "The client could not be created" }, { status: 500 });
  }
}
