import { notFound } from "next/navigation";
import { getPayload } from "payload";
import configPromise from "@/payload.config";
import AccountStructureTree from "@/app/(frontend)/partners/[clientSlug]/account-structure/AccountStructureTree";

/**
 * Route: /client/[slug]/google-ads/account-structure
 *
 * Server-rendered shell that resolves the client by slug via Payload and
 * renders the same AccountStructureTree component used by the legacy
 * /partners route. Data is fetched client-side from the proxy at
 * `/api/client/[slug]/google-ads/account-structure`, which forwards to the
 * growth-tools `/api/google-ads/account-structure/:customerId` endpoint.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<{ title: string; robots: { index: boolean; follow: boolean } }> {
  const { slug } = await params;
  const fallback = {
    title: "Account Structure · Optimise Digital",
    robots: { index: false, follow: false },
  };
  try {
    const payload = await getPayload({ config: configPromise });
    const result = await payload.find({
      collection: "clients",
      where: { slug: { equals: slug } },
      limit: 1,
      overrideAccess: true,
      select: { name: true },
    });
    const client = result.docs[0] as { name?: string } | undefined;
    if (!client) return fallback;
    return {
      title: `Account Structure: ${client.name ?? slug} · Optimise Digital`,
      robots: { index: false, follow: false },
    };
  } catch {
    return fallback;
  }
}

export default async function ClientAccountStructurePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const payload = await getPayload({ config: configPromise });
  const result = await payload.find({
    collection: "clients",
    where: {
      slug: { equals: slug },
      isActive: { equals: true },
    },
    limit: 1,
    overrideAccess: true,
    select: {
      id: true,
      name: true,
      googleAdsCustomerId: true,
    },
  });
  const client = result.docs[0] as
    | { name?: string; googleAdsCustomerId?: string }
    | undefined;
  if (!client) notFound();

  const displayName = client.name || slug;

  return (
    <AccountStructureTree
      clientSlug={slug}
      clientName={displayName}
      googleAdsCustomerId={client.googleAdsCustomerId ?? null}
      apiPath={`/api/client/${slug}/google-ads/account-structure`}
    />
  );
}
