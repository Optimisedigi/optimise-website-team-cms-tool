import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { userHasFeature } from "@/lib/access";

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
  // Contracts hold client PII and pricing: require the Contracts feature, not just a login.
  if (!userHasFeature(user, "contracts")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
