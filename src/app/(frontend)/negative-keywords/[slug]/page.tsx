import { getPayload } from "payload";
import { notFound } from "next/navigation";
import config from "@/payload.config";
import NegativeKeywordsClientView from "@/components/NegativeKeywordsClientView";

export default async function NegativeKeywordsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const payload = await getPayload({ config });

  // slug is the client ID
  const clientId = Number(slug);
  if (isNaN(clientId)) return notFound();

  let client: any;
  try {
    client = await payload.findByID({
      collection: "clients",
      id: clientId,
      overrideAccess: true,
    });
  } catch {
    return notFound();
  }

  if (!client || !client.negativeKeywordsPin) return notFound();

  // Fetch all active keyword lists for this client
  const listsResult = await payload.find({
    collection: "negative-keyword-lists",
    where: {
      client: { equals: clientId },
      isActive: { equals: true },
    },
    limit: 100,
    depth: 0,
    sort: "scope",
    overrideAccess: true,
  });

  const lists = listsResult.docs.map((list: any) => ({
    id: list.id,
    name: list.name,
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
      clientId={clientId}
      clientName={client.name || client.businessName || "Client"}
      lists={lists}
    />
  );
}
