import { getPayload } from "payload";
import { notFound } from "next/navigation";
import config from "@/payload.config";
import NegativeKeywordsClientView from "@/components/NegativeKeywordsClientView";

export default async function NegativeKeywordsPage({
  params,
}: {
  params: Promise<{ clientSlug: string; listSlug: string }>;
}) {
  const { clientSlug, listSlug } = await params;
  const payload = await getPayload({ config });

  // Look up client by slug
  const clientResult = await payload.find({
    collection: "clients",
    where: { slug: { equals: clientSlug } },
    limit: 1,
    overrideAccess: true,
  });

  const client = clientResult.docs[0] as any;
  if (!client || !client.clientPin) return notFound();

  // Fetch all active keyword lists for this client
  const listsResult = await payload.find({
    collection: "negative-keyword-lists",
    where: {
      client: { equals: client.id },
      isActive: { equals: true },
    },
    limit: 100,
    depth: 0,
    sort: "scope",
    overrideAccess: true,
  });

  // Find the specific list by slugified name
  const allLists = listsResult.docs as any[];
  const matchedList = allLists.find(
    (list) => slugify(list.name) === listSlug
  );

  if (!matchedList) return notFound();

  const lists = allLists.map((list: any) => ({
    id: list.id,
    name: list.name,
    slug: slugify(list.name),
    scope: list.scope,
    campaignName: list.campaignName || null,
    campaigns: (list.campaigns || []).map((c: any) => c.campaignName).filter(Boolean),
    adGroupName: list.adGroupName || null,
    keywords: (list.keywords || [])
      .map((kw: any, i: number) => ({
        index: i,
        keyword: kw.keyword,
        matchType: kw.matchType,
        flaggedForRemoval: !!kw.flaggedForRemoval,
        negatedAt: kw.negatedAt || null,
      }))
      // Most recently added first. Sort by negatedAt (the add date) descending;
      // fall back to insertion order (higher index = newer) when dates are
      // missing or identical, since keywords are only ever appended.
      .sort((a: any, b: any) => {
        const ta = a.negatedAt ? Date.parse(a.negatedAt) : NaN;
        const tb = b.negatedAt ? Date.parse(b.negatedAt) : NaN;
        if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return tb - ta;
        return b.index - a.index;
      }),
    updatedAt: list.updatedAt,
  }));

  return (
    <NegativeKeywordsClientView
      clientId={client.id}
      clientName={client.name || client.businessName || "Client"}
      clientSlug={clientSlug}
      lists={lists}
      activeListSlug={listSlug}
    />
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
