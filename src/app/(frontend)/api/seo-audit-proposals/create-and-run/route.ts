import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * Resolver used by the Run button on a Client or Client Proposal doc.
 *
 * Body: { proposalId?: string|number, clientId?: string|number }
 *
 * Finds an existing seo-audit-proposals record linked to that proposal/client,
 * or creates one (snapshotting the inputs), then returns its id. The button
 * then POSTs to /api/seo-audit-proposals/[id]/run and polls /status.
 */
export async function POST(req: NextRequest) {
  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { proposalId?: string | number; clientId?: string | number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const proposalId = body.proposalId != null ? Number(body.proposalId) : null;
  const clientId = body.clientId != null ? Number(body.clientId) : null;

  if (proposalId == null && clientId == null) {
    return NextResponse.json({ error: "proposalId or clientId is required" }, { status: 400 });
  }

  // Snapshot inputs from the source doc.
  let websiteUrl: string | undefined;
  let gscSiteUrl: string | undefined;
  let businessType: string | undefined;
  let location: string | undefined;
  let searchLanguage: string | undefined;
  let brandKeywords: string | undefined;
  let presentedBy: string | undefined;
  let proposalPin: string | undefined;
  let averageOrderValue: number | undefined;
  let conversionRate: number | undefined;

  try {
    if (proposalId != null) {
      const p: any = await payload.findByID({ collection: "client-proposals", id: proposalId, overrideAccess: true });
      websiteUrl = p.websiteUrl || undefined;
      gscSiteUrl = p.gscSiteUrl || undefined;
      businessType = p.businessType || undefined;
      location = p.targetLocation || undefined;
      searchLanguage = p.searchLanguage || undefined;
      presentedBy = p.presentedBy || undefined;
      proposalPin = p.proposalPin || undefined;
      averageOrderValue = p.averageOrderValue ?? undefined;
      conversionRate = p.leadConversionRate ?? undefined;
    } else if (clientId != null) {
      const c: any = await payload.findByID({ collection: "clients", id: clientId, overrideAccess: true });
      websiteUrl = c.websiteUrl || undefined;
      gscSiteUrl = c.gscSiteUrl || undefined;
      businessType = c.businessType || undefined;
      location = c.targetLocation || undefined;
      searchLanguage = c.searchLanguage || undefined;
      brandKeywords = c.brandKeywords || undefined;
      presentedBy = c.presentedBy || undefined;
      proposalPin = c.clientPin || undefined;
      averageOrderValue = c.averageOrderValue ?? undefined;
      conversionRate = c.leadConversionRate ?? undefined;
    }
  } catch (err: any) {
    return NextResponse.json({ error: "Source document not found", detail: err?.message }, { status: 404 });
  }

  if (!websiteUrl || !gscSiteUrl) {
    return NextResponse.json(
      {
        error:
          "The linked record is missing a website URL or GSC property. Add both (and ideally AOV + conversion rate) before running.",
      },
      { status: 400 },
    );
  }

  // Reuse an existing record for this source if present.
  const where = proposalId != null
    ? { proposal: { equals: proposalId } }
    : { client: { equals: clientId } };

  let recordId: number | string | null = null;
  try {
    const existing = await payload.find({
      collection: "seo-audit-proposals",
      where: where as any,
      limit: 1,
      sort: "-createdAt",
      overrideAccess: true,
    });
    if (existing.docs.length > 0) recordId = existing.docs[0].id;
  } catch {
    /* ignore — will create below */
  }

  const data = {
    ...(proposalId != null ? { proposal: proposalId } : {}),
    ...(clientId != null ? { client: clientId } : {}),
    websiteUrl,
    gscSiteUrl,
    businessType: businessType || null,
    location: location || null,
    searchLanguage: searchLanguage || null,
    brandKeywords: brandKeywords || null,
    presentedBy: presentedBy || null,
    proposalPin: proposalPin || null,
    averageOrderValue: averageOrderValue ?? null,
    conversionRate: conversionRate ?? null,
    status: "pending",
  };

  try {
    if (recordId != null) {
      await payload.update({ collection: "seo-audit-proposals", id: recordId, data: data as any, overrideAccess: true });
    } else {
      const created = await payload.create({ collection: "seo-audit-proposals", data: data as any, overrideAccess: true });
      recordId = created.id;
    }

    // Keep the visible relationship field on the source document in sync so the
    // run appears immediately on the Client/Client Proposal tab in admin.
    if (proposalId != null) {
      await payload.update({
        collection: "client-proposals",
        id: proposalId,
        data: { seoAuditProposal: recordId } as any,
        overrideAccess: true,
      });
    } else if (clientId != null) {
      const client: any = await payload.findByID({ collection: "clients", id: clientId, overrideAccess: true });
      const existingLinks = Array.isArray(client.seoAuditProposals) ? client.seoAuditProposals : [];
      const nextLinks = [recordId, ...existingLinks]
        .map((item) => (typeof item === "object" && item ? item.id : item))
        .filter((item, index, arr) => item != null && arr.indexOf(item) === index);
      await payload.update({
        collection: "clients",
        id: clientId,
        data: { seoAuditProposals: nextLinks } as any,
        overrideAccess: true,
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to create SEO Audit Proposal record", detail: err?.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: recordId });
}
