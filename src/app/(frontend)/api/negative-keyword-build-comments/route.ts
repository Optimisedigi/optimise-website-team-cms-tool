import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";
import { checkPinWithLockout } from "@/lib/pin-auth";

/**
 * POST /api/negative-keyword-build-comments
 * Handles save-edits and submit-approval for the public negative keyword page.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { slug, pin, action } = body;

  if (!slug || !pin) {
    return NextResponse.json({ error: "slug and pin are required" }, { status: 400 });
  }

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const results = await payload.find({
    collection: "google-ads-audits",
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  });

  if (!results.docs.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const audit = results.docs[0] as any;

  if (!audit.negativeListBuilderPublished) {
    return NextResponse.json({ error: "Not published" }, { status: 403 });
  }
  const pinResult = await checkPinWithLockout(
    `nkb-comments:${audit.id}`,
    pin,
    audit.presentationPin ?? "",
  );
  if (!pinResult.ok) {
    return NextResponse.json(
      { error: pinResult.message },
      { status: pinResult.status },
    );
  }

  const nlb = audit.negativeListBuilder as any;
  if (!nlb) {
    return NextResponse.json({ error: "No data" }, { status: 404 });
  }

  if (action === "save-edits") {
    // Un-merge account-wide keywords back into universal + accountWide
    const universalNegatives = [...(nlb.universalNegatives || [])];
    const accountWideNegatives = [...(nlb.accountWideNegatives || [])];

    // Build lookup maps for existing categories
    const universalMap = new Map<string, number>();
    universalNegatives.forEach((cat: any, i: number) => universalMap.set(cat.name, i));
    const accountWideMap = new Map<string, number>();
    accountWideNegatives.forEach((cat: any, i: number) => accountWideMap.set(cat.name, i));

    // Process edited account-wide keywords (flat array) back into tiers
    for (const kw of (body.accountWideKeywords || [])) {
      const source = kw.sourceSection || "accountWide";
      const sourceCatName = kw.sourceCategoryName || "Uncategorized";
      const targetMap = source === "universal" ? universalMap : accountWideMap;

      let catIdx = targetMap.get(sourceCatName);
      if (catIdx === undefined) {
        // Category was moved or new — put in accountWide
        catIdx = accountWideNegatives.length;
        accountWideNegatives.push({ name: sourceCatName, keywords: [] });
        accountWideMap.set(sourceCatName, catIdx);
      }

      // Find and update the keyword, or add if new
      const targetCat = source === "universal" ? universalNegatives[catIdx] : accountWideNegatives[catIdx];
      const existingIdx = targetCat.keywords.findIndex(
        (existing: any) => existing.phrase === kw.originalPhrase || existing.phrase === kw.phrase
      );
      const updatedKw = { ...kw };
      delete updatedKw.sourceSection;
      delete updatedKw.sourceCategoryName;
      delete updatedKw.originalPhrase;

      if (existingIdx >= 0) {
        // Preserve agency `removed` flag, update everything else
        targetCat.keywords[existingIdx] = {
          ...targetCat.keywords[existingIdx],
          phrase: updatedKw.phrase,
          matchType: updatedKw.matchType,
          clientRemoved: updatedKw.clientRemoved,
          clientComment: updatedKw.clientComment,
        };
      } else {
        targetCat.keywords.push(updatedKw);
      }
    }

    // Campaign-specific: direct replace
    const campaignSpecificNegatives = (body.campaignSpecificKeywords || []).map((group: any) => ({
      campaignName: group.campaignName,
      approved: true,
      keywords: (group.keywords || []).map((kw: any) => {
        const cleaned = { ...kw };
        delete cleaned.sourceSection;
        delete cleaned.sourceCategoryName;
        delete cleaned.originalPhrase;
        return cleaned;
      }),
    }));

    const updatedNlb = {
      ...nlb,
      universalNegatives,
      accountWideNegatives,
      campaignSpecificNegatives,
      clientNotes: body.clientNotes ?? nlb.clientNotes,
    };

    await payload.update({
      collection: "google-ads-audits",
      id: audit.id,
      data: { negativeListBuilder: updatedNlb },
      overrideAccess: true,
    });

    return NextResponse.json({ ok: true });
  }

  if (action === "submit-approval") {
    const updatedNlb = {
      ...nlb,
      status: "client_approved",
      clientApprovedAt: new Date().toISOString(),
      clientNotes: body.clientNotes ?? nlb.clientNotes,
    };

    await payload.update({
      collection: "google-ads-audits",
      id: audit.id,
      data: { negativeListBuilder: updatedNlb },
      overrideAccess: true,
    });

    // Send email notification to account managers
    try {
      const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY;
      const TEAM_EMAIL = process.env.TEAM_NOTIFICATION_EMAIL;

      let recipientEmails: string[] = [];

      // Try to get account manager emails from linked client
      if (audit.client) {
        const clientId = typeof audit.client === "object" ? audit.client.id : audit.client;
        try {
          const client = await payload.findByID({
            collection: "clients",
            id: clientId,
            overrideAccess: true,
          });
          const managers = (client as any)?.accountManagers;
          if (Array.isArray(managers)) {
            recipientEmails = managers
              .map((m: any) => m.email)
              .filter(Boolean);
          }
        } catch {}
      }

      if (!recipientEmails.length && TEAM_EMAIL) {
        recipientEmails = [TEAM_EMAIL];
      }

      if (POSTMARK_API_KEY && recipientEmails.length) {
        await fetch("https://api.postmarkapp.com/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Postmark-Server-Token": POSTMARK_API_KEY,
          },
          body: JSON.stringify({
            From: process.env.POSTMARK_FROM_EMAIL || "noreply@optimisedigital.online",
            To: recipientEmails.join(","),
            Subject: `Negative Keyword List Approved — ${audit.businessName}`,
            HtmlBody: `
              <p>The negative keyword list for <strong>${audit.businessName}</strong> has been approved by the client.</p>
              <p>${body.clientNotes ? `<strong>Client notes:</strong> ${body.clientNotes}` : "No additional notes."}</p>
              <p><a href="${process.env.NEXT_PUBLIC_SERVER_URL || "https://cms.optimisedigital.online"}/admin/collections/google-ads-audits/${audit.id}">View in CMS</a></p>
            `,
            MessageStream: "outbound",
          }),
        });
      }
    } catch {}

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
