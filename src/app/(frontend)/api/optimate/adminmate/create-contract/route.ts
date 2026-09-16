import { NextResponse } from "next/server";
import { createLocalReq, getPayload } from "payload";
import config from "@/payload.config";
import { validateStagedContract, type StagedContract } from "@/lib/agents/adminmate";
import { ClientSlugConflictError, createClientFromStaged } from "@/lib/agents/adminmate/create-client";
import { buildContractDataFromSource } from "@/lib/contract-from-template";

/**
 * Creates the draft contract the admin confirmed in the AdminMate review card.
 *
 * The staged payload arrives from the browser, so it is re-validated through
 * the same allowlist the agent used. The contract is always cloned from a live
 * template, then the staged client/pricing details are overlaid. When the card
 * carries a new client, that client is created first and the contract is
 * linked to it; a slug conflict aborts before any write.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: request.headers });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((user as { role?: string }).role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  let staged: StagedContract;
  try {
    staged = validateStagedContract(body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid contract" }, { status: 400 });
  }

  const template = await payload.findByID({
    collection: "contracts",
    id: staged.templateId,
    depth: 0,
    overrideAccess: true,
  }).catch(() => null);
  if (!template || !template.isTemplate || template.deletedAt) {
    return NextResponse.json({ error: "That contract template no longer exists. Pick another template." }, { status: 404 });
  }

  const req = await createLocalReq({ user }, payload);
  let clientId: number;
  let clientCreated: { id: number; name: string; slug: string } | undefined;
  if (staged.newClient) {
    try {
      clientCreated = await createClientFromStaged(payload, staged.newClient, req);
      clientId = clientCreated.id;
    } catch (error) {
      if (error instanceof ClientSlugConflictError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      console.error("[adminmate/create-contract] client create failed:", error);
      return NextResponse.json({ error: "The new client could not be created, so no contract was created" }, { status: 500 });
    }
  } else {
    const client = await payload.findByID({
      collection: "clients",
      id: staged.clientId!,
      depth: 0,
      overrideAccess: true,
    }).catch(() => null);
    if (!client) return NextResponse.json({ error: "That client no longer exists. Pick another client." }, { status: 404 });
    clientId = client.id;
  }

  const data = buildContractDataFromSource(template);
  Object.assign(data, {
    contractTitle: staged.contractTitle,
    client: clientId,
    clientName: staged.clientName,
    clientTradingName: staged.clientTradingName ?? null,
    clientContactName: staged.clientContactName ?? null,
    clientEmail: staged.clientEmail ?? "placeholder@example.com",
    clientTitle: staged.clientTitle ?? null,
    clientPhone: staged.clientPhone ?? null,
    clientAcn: staged.clientAcn ?? null,
    clientWebsite: staged.clientWebsite ?? null,
    clientBusinessAddress: staged.clientBusinessAddress ?? null,
    contractDate: staged.contractDate,
    contractStartDate: staged.contractStartDate ?? null,
    contractEndDate: staged.contractEndDate ?? null,
    effectiveDateConfirmed: staged.effectiveDateConfirmed,
    effectiveDateOnDeposit: staged.effectiveDateOnDeposit,
    ...(staged.currency ? { currency: staged.currency } : {}),
    ...(staged.monthlyRetainer === undefined ? {} : { monthlyRetainer: staged.monthlyRetainer }),
    ...(staged.setupFee === undefined ? {} : { setupFee: staged.setupFee }),
    hideSetupFee: staged.hideSetupFee,
    ...(staged.monthlyHosting === undefined ? {} : { monthlyHosting: staged.monthlyHosting }),
    ...(staged.annualHosting === undefined ? {} : { annualHosting: staged.annualHosting }),
    ...(staged.additionalWork ? { additionalWork: staged.additionalWork } : {}),
    ...(staged.contractTerm ? { contractTerm: staged.contractTerm } : {}),
    ...(staged.paymentTerms ? { paymentTerms: staged.paymentTerms } : {}),
  });

  try {
    const created = await payload.create({
      collection: "contracts",
      data: data as any,
      depth: 0,
      overrideAccess: false,
      req,
    });
    return NextResponse.json({
      id: created.id,
      contractTitle: created.contractTitle,
      clientId,
      clientCreated,
      adminUrl: `/admin/collections/contracts/${created.id}`,
    });
  } catch (error) {
    console.error("[adminmate/create-contract] create failed:", error);
    return NextResponse.json(
      { error: clientCreated ? `The client ${clientCreated.name} was created, but the contract could not be created` : "The contract could not be created" },
      { status: 500 },
    );
  }
}
