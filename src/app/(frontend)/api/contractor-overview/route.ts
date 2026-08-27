import { NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { headers as nextHeaders } from "next/headers";
import { loadContractorOverview } from "@/lib/contractor-overview";

/** Compact, auto-derived transfer-management data for the Contractor Costs admin page. */
export async function GET() {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });
  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const overview = await loadContractorOverview(payload);
  return NextResponse.json(overview);
}
