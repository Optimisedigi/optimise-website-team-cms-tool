import { NextResponse } from "next/server";
import { createLocalReq, getPayload } from "payload";
import config from "@/payload.config";
import { validateStagedClient } from "@/lib/agents/adminmate";

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

  const conflict = await payload.find({
    collection: "clients",
    where: { slug: { equals: staged.slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { name: true },
  });
  if (conflict.totalDocs > 0) {
    return NextResponse.json(
      { error: `Slug "${staged.slug}" is already used by ${conflict.docs[0]?.name ?? "another client"}. Edit the slug and try again.` },
      { status: 409 },
    );
  }

  try {
    const created = await payload.create({
      collection: "clients",
      data: {
        name: staged.name,
        slug: staged.slug,
        tradingName: staged.tradingName ?? null,
        websiteUrl: staged.websiteUrl ?? null,
        services: staged.services ?? null,
        contactName: staged.contactName ?? null,
        contactEmail: staged.contactEmail ?? null,
        contactPhone: staged.contactPhone ?? null,
        ...(staged.clientType ? { clientType: staged.clientType } : {}),
        ...(staged.monthlyRetainer === undefined ? {} : { monthlyRetainer: staged.monthlyRetainer }),
        ...(staged.setupFee === undefined ? {} : { setupFee: staged.setupFee }),
        isActive: staged.isActive,
        ...(staged.notes ? { clientPulse: { notes: staged.notes } } : {}),
      },
      depth: 0,
      overrideAccess: false,
      req: await createLocalReq({ user }, payload),
    });
    return NextResponse.json({ id: created.id, name: created.name, slug: created.slug });
  } catch (error) {
    console.error("[adminmate/create-client] create failed:", error);
    return NextResponse.json({ error: "The client could not be created" }, { status: 500 });
  }
}
