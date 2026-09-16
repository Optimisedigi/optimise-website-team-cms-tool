import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { buildContractDataFromSource } from "@/lib/contract-from-template";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Check auth
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const source = await payload.findByID({
      collection: "contracts",
      id,
      overrideAccess: true,
    }) as any;

    if (!source) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    const data = buildContractDataFromSource(source);

    // Optional: the client Business tab passes `{ clientId }` so the new
    // draft opens already linked to (and pre-filled from) that client.
    const body = await req.json().catch(() => null) as { clientId?: unknown } | null;
    const clientId = typeof body?.clientId === "number" || (typeof body?.clientId === "string" && /^\d+$/.test(body.clientId))
      ? Number(body.clientId)
      : null;
    if (clientId != null) {
      const client = await payload.findByID({
        collection: "clients",
        id: clientId,
        depth: 0,
        overrideAccess: true,
      }).catch(() => null);
      if (!client) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 });
      }
      data.client = client.id;
      data.contractTitle = `${source.isTemplate ? source.contractTitle || "Service Agreement" : data.contractTitle} - ${client.name}`;
      data.clientName = client.name || "";
      data.clientTradingName = client.tradingName || undefined;
      data.clientContactName = client.contactName || undefined;
      data.clientEmail = client.contactEmail || "placeholder@example.com";
      data.clientPhone = client.contactPhone || undefined;
      data.clientWebsite = client.websiteUrl || undefined;
    }

    const newContract = await payload.create({
      collection: "contracts",
      data: data as any,
      overrideAccess: true,
    });

    return NextResponse.json({ id: newContract.id });
  } catch (e: any) {
    console.error("[duplicate-contract] Error:", e.message);
    return NextResponse.json({ error: e.message || "Failed to duplicate contract" }, { status: 500 });
  }
}
