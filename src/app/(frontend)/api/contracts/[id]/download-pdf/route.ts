import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let doc: any;
  try {
    doc = await payload.findByID({
      collection: "contracts",
      id,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  if (!doc.signedPdfUrl) {
    return NextResponse.json(
      { error: "No signed PDF available yet" },
      { status: 404 },
    );
  }

  return NextResponse.redirect(doc.signedPdfUrl);
}
