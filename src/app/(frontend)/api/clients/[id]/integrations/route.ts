import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: req.headers });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const client = await payload.findByID({
      collection: "clients",
      id,
      overrideAccess: true,
      select: {
        ga4Connected: true,
        ga4PropertyId: true,
        gscConnected: true,
        gscPropertyUrl: true,
      } as any,
    });

    return NextResponse.json({
      id: client.id,
      ga4Connected: Boolean(client.ga4Connected),
      ga4PropertyId: client.ga4PropertyId ?? "",
      gscConnected: Boolean(client.gscConnected),
      gscPropertyUrl: client.gscPropertyUrl ?? "",
    });
  } catch {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
}
