import type { Where } from "payload";
import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import {
  findCoveringNegative,
  type CoverageNkl,
} from "@/lib/match-type-negation-coverage";

export async function GET(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const client = searchParams.get("client");
  const clientId = client && /^\d+$/.test(client) ? Number(client) : client;
  const status = searchParams.get("status");
  const matchType = searchParams.get("matchType");
  const violationType = searchParams.get("violationType");
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50", 10));
  const page = parseInt(searchParams.get("page") ?? "1", 10);

  const whereClauses: Where[] = [];
  if (clientId) whereClauses.push({ client: { equals: clientId } } as Where);
  if (status) whereClauses.push({ status: { equals: status } } as Where);
  if (matchType) whereClauses.push({ matchType: { equals: matchType } } as Where);
  if (violationType) whereClauses.push({ violationType: { equals: violationType } } as Where);

  const result = await (payload.find as any)({
    collection: "match-type-violation-candidates",
    where: whereClauses.length > 0 ? { and: whereClauses } : {},
    limit,
    page,
    sort: "-clicks,-impressions,-lastSeenAt",
    depth: 1,
    overrideAccess: true,
  });

  // Live suppression: hide any pending candidate whose search term is already
  // covered by an active negative keyword routing to its campaign / ad group.
  // The cron does this at sync time, but negatives added since the last sync
  // would otherwise linger in the review list until the next run — this filters
  // them out on read so newly-added negatives take effect immediately.
  let docs: any[] = result.docs;
  let suppressed = 0;
  if (clientId && typeof clientId === "number") {
    const pending = docs.filter((d) => d?.status === "pending");
    if (pending.length > 0) {
      const nklResult = await (payload.find as any)({
        collection: "negative-keyword-lists",
        where: {
          and: [{ client: { equals: clientId } }, { isActive: { equals: true } }],
        },
        depth: 0,
        limit: 500,
        overrideAccess: true,
      });
      const negatives: CoverageNkl[] = Array.isArray(nklResult?.docs) ? nklResult.docs : [];
      if (negatives.length > 0) {
        docs = docs.filter((d) => {
          if (d?.status !== "pending") return true;
          const covered = findCoveringNegative(
            String(d.searchTerm ?? ""),
            { campaignName: d.campaignName, adGroupName: d.adGroupName },
            negatives,
          );
          if (covered) suppressed++;
          return !covered;
        });
      }
    }
  }

  return NextResponse.json({
    docs,
    totalDocs: Math.max(0, (result.totalDocs ?? docs.length) - suppressed),
    page: result.page,
    totalPages: result.totalPages,
  });
}
