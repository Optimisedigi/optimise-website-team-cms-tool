import type { Where } from "payload";
import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

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

  return NextResponse.json({
    docs: result.docs,
    totalDocs: result.totalDocs,
    page: result.page,
    totalPages: result.totalPages,
  });
}
