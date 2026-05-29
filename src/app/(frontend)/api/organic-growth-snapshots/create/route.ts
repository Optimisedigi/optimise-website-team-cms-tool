import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { buildOrganicGrowthSnapshot, snapshotAlreadyExists } from "@/lib/quarterly-organic-growth";

type CreateBody = { clientId?: string | number; gscSnapshotId?: string | number };

function authorised(request: Request): boolean {
  const key = request.headers.get("x-api-key") || request.headers.get("x-internal-key");
  if (key && (key === process.env.AUDIT_API_KEY || key === process.env.INTERNAL_API_KEY || key === process.env.CRON_SECRET)) return true;
  return request.headers.get("x-requested-with") === "payload-admin";
}

export async function POST(request: Request) {
  if (!authorised(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  let body: CreateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.clientId || !body.gscSnapshotId) {
    return NextResponse.json({ ok: false, error: "clientId and gscSnapshotId are required" }, { status: 400 });
  }

  const payload = await getPayload({ config: await config });
  const [client, gscSnapshot, blogPosts] = await Promise.all([
    payload.findByID({ collection: "clients" as any, id: body.clientId, depth: 0, overrideAccess: true }),
    payload.findByID({ collection: "gsc-snapshots" as any, id: body.gscSnapshotId, depth: 0, overrideAccess: true }),
    payload.find({ collection: "blog-posts" as any, where: { client: { equals: body.clientId } }, limit: 100, depth: 0, overrideAccess: true }),
  ]);

  const snapshotData = buildOrganicGrowthSnapshot({ client: client as any, gscSnapshot: gscSnapshot as any, blogPosts: blogPosts.docs as any });
  const existing = await payload.find({
    collection: "quarterly-organic-growth-snapshots" as any,
    where: { client: { equals: body.clientId } },
    limit: 100,
    depth: 0,
    overrideAccess: true,
  });
  const periodEnd = typeof snapshotData.periodEnd === "string" ? snapshotData.periodEnd : "";
  const snapshotType = typeof snapshotData.snapshotType === "string" ? snapshotData.snapshotType : "manual";
  if (snapshotAlreadyExists(existing.docs as any, body.clientId, periodEnd, snapshotType, body.gscSnapshotId)) {
    return NextResponse.json({ ok: true, created: false, snapshot: existing.docs[0] });
  }

  const doc = await payload.create({
    collection: "quarterly-organic-growth-snapshots" as any,
    data: snapshotData as any,
    overrideAccess: true,
  });
  return NextResponse.json({ ok: true, created: true, snapshot: doc }, { status: 201 });
}
