import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * Import approved negative keywords from the builder into CMS negative-keyword-lists.
 * Creates up to 3 list types:
 *   - Universal Negatives → account-level list
 *   - Account-Wide Negatives → account-level list
 *   - Campaign-Specific → one campaign-level list per campaign
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const { user } = await payload.auth({ headers: req.headers });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let audit: any;
  try {
    audit = await payload.findByID({
      collection: "google-ads-audits",
      id,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  const nlb = audit.negativeListBuilder as any;
  if (!nlb?.status) {
    return NextResponse.json({ error: "No negative list builder data" }, { status: 400 });
  }

  // Must have a linked client to create lists
  const clientId = audit.client;
  if (!clientId) {
    return NextResponse.json(
      { error: "This audit must be linked to a client (sidebar) before importing lists" },
      { status: 400 }
    );
  }

  const created: string[] = [];
  const skipped: string[] = [];

  // Helper: convert builder keywords to CMS keyword format (skip removed keywords)
  function toCmsKeywords(keywords: any[]) {
    return (keywords || [])
      .filter((kw: any) => !kw.removed && !kw.clientRemoved)
      .map((kw: any) => ({
        keyword: kw.phrase as string,
        matchType: (kw.matchType === "PHRASE" ? "phrase" : "exact") as "phrase" | "exact",
        flaggedForRemoval: false,
      }));
  }

  // Helper: check if a list with this name already exists for the client
  async function listExists(name: string): Promise<boolean> {
    const existing = await payload.find({
      collection: "negative-keyword-lists",
      where: {
        client: { equals: typeof clientId === 'object' ? clientId.id : clientId },
        name: { equals: name },
      },
      limit: 1,
    });
    return existing.totalDocs > 0;
  }

  const resolvedClientId = typeof clientId === 'object' ? clientId.id : clientId;

  // 1. Universal Negatives (account-level)
  const universalKeywords = (nlb.universalNegatives || [])
    .filter((c: any) => c.approved !== false)
    .flatMap((c: any) => c.keywords || []);

  if (universalKeywords.length > 0) {
    const name = "Universal Negatives (Builder)";
    if (await listExists(name)) {
      skipped.push(name);
    } else {
      await payload.create({
        collection: "negative-keyword-lists",
        data: {
          client: resolvedClientId,
          name,
          scope: "account",
          campaignRegex: ".*",
          keywords: toCmsKeywords(universalKeywords),
          isActive: true,
        },
        overrideAccess: true,
      });
      created.push(name);
    }
  }

  // 2. Account-Wide Negatives (account-level)
  const accountKeywords = (nlb.accountWideNegatives || [])
    .filter((c: any) => c.approved !== false)
    .flatMap((c: any) => c.keywords || []);

  if (accountKeywords.length > 0) {
    const name = "Account-Wide Negatives (Builder)";
    if (await listExists(name)) {
      skipped.push(name);
    } else {
      await payload.create({
        collection: "negative-keyword-lists",
        data: {
          client: resolvedClientId,
          name,
          scope: "account",
          campaignRegex: ".*",
          keywords: toCmsKeywords(accountKeywords),
          isActive: true,
        },
        overrideAccess: true,
      });
      created.push(name);
    }
  }

  // 3. Campaign-Specific Negatives (one list per campaign)
  const campaignGroups = (nlb.campaignSpecificNegatives || [])
    .filter((c: any) => c.approved !== false);

  for (const group of campaignGroups) {
    const campaignName = group.campaignName;
    if (!group.keywords?.length) continue;

    const name = `${campaignName} - Negatives (Builder)`;
    if (await listExists(name)) {
      skipped.push(name);
      continue;
    }

    await payload.create({
      collection: "negative-keyword-lists",
      data: {
        client: resolvedClientId,
        name,
        scope: "campaign",
        campaigns: [{ campaignName }],
        keywords: toCmsKeywords(group.keywords),
        isActive: true,
      },
      overrideAccess: true,
    });
    created.push(name);
  }

  return NextResponse.json({
    created,
    skipped,
    total: created.length + skipped.length,
  });
}
