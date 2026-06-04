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

  const { searchParams } = new URL(req.url);
  const client = searchParams.get("client");
  const status = searchParams.get("status");
  const nkl = searchParams.get("nkl");
  const overlapRisk = searchParams.get("overlapRisk");
  const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);
  const page = Math.max(Number(searchParams.get("page") ?? "1"), 1);

  const where: Record<string, unknown> = {};

  if (client) {
    where.client = { equals: client };
  }
  if (status) {
    where.status = { equals: status };
  }
  if (nkl) {
    where.nkl = { equals: nkl };
  }
  if (overlapRisk === "true") {
    where.overlapRisk = { equals: true };
  }

  const result = await (payload.find as any)({
    collection: "consolidation-candidates",
    where,
    depth: 1,
    limit,
    page,
    sort: "-createdAt",
    overrideAccess: true,
  });

  return NextResponse.json({
    docs: result.docs,
    totalDocs: result.totalDocs,
    page: result.page,
    totalPages: result.totalPages,
    limit,
  });
}
