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
  if (!client || !client.negativeKeywordsPin) return notFound();

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
    adGroupName: list.adGroupName || null,
    keywords: (list.keywords || []).map((kw: any, i: number) => ({
      index: i,
      keyword: kw.keyword,
      matchType: kw.matchType,
      flaggedForRemoval: !!kw.flaggedForRemoval,
    })),
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
