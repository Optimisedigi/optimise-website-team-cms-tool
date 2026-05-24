import { notFound } from "next/navigation";
import { getPayload } from "payload";
import configPromise from "@/payload.config";
import AccountStructureTree from "./AccountStructureTree";
// Loads Tailwind v4 utilities for this route — the (frontend) root layout
// deliberately ships no Tailwind to avoid bloating marketing pages.
import "@/app/(frontend)/client/account-structure.css";

/**
 * Route: /partners/[clientSlug]/account-structure
 *
 * Server-rendered shell that resolves the client by slug and hands off to the
 * AccountStructureTree client component. The tree fetches structure data from
 * `/api/partners/[clientSlug]/account-structure` (which proxies the growth-tools
 * Railway service).
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}): Promise<{ title: string; robots: { index: boolean; follow: boolean } }> {
  const { clientSlug } = await params;
  const fallback = {
    title: "Account Structure · Optimise Digital",
    robots: { index: false, follow: false },
  };
  try {
    const payload = await getPayload({ config: configPromise });
    const result = await payload.find({
      collection: "clients",
      where: { slug: { equals: clientSlug } },
      limit: 1,
      depth: 0,
    });
    const client = result.docs[0] as { name?: string } | undefined;
    if (!client) return fallback;
    return {
      title: `Account Structure: ${client.name ?? clientSlug} · Optimise Digital`,
      robots: { index: false, follow: false },
    };
  } catch {
    return fallback;
  }
}

export default async function AccountStructurePage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const { clientSlug } = await params;

  const payload = await getPayload({ config: configPromise });
  const result = await payload.find({
    collection: "clients",
    where: { slug: { equals: clientSlug } },
    limit: 1,
    depth: 0,
  });
  const client = result.docs[0] as
    | { name?: string; tradingName?: string; googleAdsCustomerId?: string }
    | undefined;
  if (!client) notFound();

  const displayName = client.tradingName?.trim() || client.name || clientSlug;

  return (
    <AccountStructureTree
      clientSlug={clientSlug}
      clientName={displayName}
      googleAdsCustomerId={client.googleAdsCustomerId ?? null}
    />
  );
}
