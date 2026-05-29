import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { buildOrganicGrowthSnapshot, selectDueSnapshot } from "@/lib/quarterly-organic-growth";

function authorised(request: Request): boolean {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : request.headers.get("x-cron-secret");
  return !!process.env.CRON_SECRET && token === process.env.CRON_SECRET;
}

export async function GET(request: Request) {
  if (!authorised(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const payload = await getPayload({ config: await config });
  const clients = await payload.find({ collection: "clients" as any, where: { isActive: { equals: true } }, limit: 200, depth: 0, overrideAccess: true });
  const now = new Date();
  const created: Array<string | number> = [];

  for (const client of clients.docs as Array<Record<string, unknown>>) {
    const startDate = new Date(String(client.clientStartDate || client.createdAt || now.toISOString()));
    const existing = await payload.find({
      collection: "quarterly-organic-growth-snapshots" as any,
      where: { client: { equals: client.id } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    });
    const due = selectDueSnapshot(startDate, now, existing.docs as any, client.id as string | number);
    if (!due) continue;

    const gsc = await payload.find({
      collection: "gsc-snapshots" as any,
      where: { and: [{ client: { equals: client.id } }, { periodEnd: { less_than_equal: due.periodEnd } }] },
      sort: "-periodEnd",
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const gscSnapshot = gsc.docs[0] as Record<string, unknown> | undefined;
    if (!gscSnapshot) continue;
    const blogPosts = await payload.find({ collection: "blog-posts" as any, where: { client: { equals: client.id } }, limit: 100, depth: 0, overrideAccess: true });
    const data = buildOrganicGrowthSnapshot({ client: client as any, gscSnapshot: { ...gscSnapshot, snapshotDate: due.snapshotDate, periodStart: due.periodStart, periodEnd: due.periodEnd } as any, blogPosts: blogPosts.docs as any });
    const doc = await payload.create({ collection: "quarterly-organic-growth-snapshots" as any, data: { ...data, snapshotType: due.snapshotType } as any, overrideAccess: true });
    created.push(doc.id);
  }

  return NextResponse.json({ ok: true, createdCount: created.length, created });
}
