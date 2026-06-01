import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";

export async function GET() {
  try {
    const payload = await getPayload({ config });
    const headersList = await nextHeaders();
    const { user } = await payload.auth({ headers: headersList });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await payload.find({
      collection: "clients",
      where: { isActive: { not_equals: false } },
      sort: "name",
      limit: 500,
      depth: 0,
      select: {
        name: true,
        slug: true,
        gscConnected: true,
      } as any,
    });

    const clientIds = result.docs.map((c: any) => c.id);

    const [seoAudits, migrations, quarterlySnapshots, siteHealthReports] = await Promise.all(
      clientIds.length
        ? [
            payload.find({ collection: "seo-audits", where: { client: { in: clientIds } }, sort: "-createdAt", limit: 1000, depth: 0, select: { client: true, overallScore: true, auditStatus: true, createdAt: true } as any }),
            payload.find({ collection: "seo-migration-checks", where: { client: { in: clientIds } }, sort: "-createdAt", limit: 1000, depth: 0, select: { client: true, status: true, createdAt: true } as any }),
            payload.find({ collection: "quarterly-organic-growth-snapshots", where: { client: { in: clientIds } }, limit: 1000, depth: 0, select: { client: true } as any }),
            payload.find({ collection: "site-health-reports", where: { client: { in: clientIds } }, limit: 1000, depth: 0, select: { client: true } as any }),
          ]
        : [
            { docs: [] as any[] },
            { docs: [] as any[] },
            { docs: [] as any[] },
            { docs: [] as any[] },
          ],
    );

    const clientIdFor = (doc: any): number | string | undefined =>
      typeof doc.client === "object" ? doc.client?.id : doc.client;

    const latestSeoAuditByClient = new Map<number | string, any>();
    const latestMigrationByClient = new Map<number | string, any>();
    const counts = new Map<number | string, { seoAudits: number; migrations: number; internalLinks: number; quarterlySnapshots: number; siteHealthReports: number }>();

    const ensureCounts = (clientId: number | string) => {
      if (!counts.has(clientId)) {
        counts.set(clientId, { seoAudits: 0, migrations: 0, internalLinks: 0, quarterlySnapshots: 0, siteHealthReports: 0 });
      }
      return counts.get(clientId)!;
    };

    for (const audit of seoAudits.docs as any[]) {
      const clientId = clientIdFor(audit);
      if (clientId == null) continue;
      ensureCounts(clientId).seoAudits += 1;
      if (!latestSeoAuditByClient.has(clientId)) latestSeoAuditByClient.set(clientId, audit);
    }
    for (const migration of migrations.docs as any[]) {
      const clientId = clientIdFor(migration);
      if (clientId == null) continue;
      ensureCounts(clientId).migrations += 1;
      if (!latestMigrationByClient.has(clientId)) latestMigrationByClient.set(clientId, migration);
    }
    for (const doc of quarterlySnapshots.docs as any[]) {
      const clientId = clientIdFor(doc);
      if (clientId != null) ensureCounts(clientId).quarterlySnapshots += 1;
    }
    for (const doc of siteHealthReports.docs as any[]) {
      const clientId = clientIdFor(doc);
      if (clientId != null) ensureCounts(clientId).siteHealthReports += 1;
    }

    const clients = (result.docs as any[]).map((client) => {
      const latestSeoAudit = latestSeoAuditByClient.get(client.id);
      const latestMigration = latestMigrationByClient.get(client.id);
      return {
        id: client.id,
        name: client.name,
        slug: client.slug,
        gscConnected: !!client.gscConnected,
        latestSeoAudit: latestSeoAudit
          ? {
              id: latestSeoAudit.id,
              overallScore: latestSeoAudit.overallScore ?? null,
              auditStatus: latestSeoAudit.auditStatus ?? null,
              createdAt: latestSeoAudit.createdAt,
            }
          : null,
        latestMigration: latestMigration
          ? {
              id: latestMigration.id,
              status: latestMigration.status ?? null,
              createdAt: latestMigration.createdAt,
            }
          : null,
        counts: counts.get(client.id) ?? { seoAudits: 0, migrations: 0, internalLinks: 0, quarterlySnapshots: 0, siteHealthReports: 0 },
      };
    });

    return NextResponse.json(clients);
  } catch (err) {
    console.error("[clients/seo-list] error:", err);
    return NextResponse.json({ error: "Failed to load SEO clients" }, { status: 500 });
  }
}
