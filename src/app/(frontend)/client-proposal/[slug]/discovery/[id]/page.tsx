/**
 * CMS-bound Client Discovery Briefing form page (scoped by proposal slug).
 *
 * Route: /client-proposal/<slug>/discovery/<paddedId>
 *
 * Auth-gated (admin login). Server-renders the briefing state from Payload,
 * then mounts the client component. Pre-fills `businessName` from the parent
 * proposal record when the saved state has none.
 */

import { headers as nextHeaders } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import { DiscoveryBriefingForm } from "@/components/discovery-briefing/DiscoveryBriefingForm";
import {
  parseBriefingId,
  resolveScopedBriefing,
} from "@/lib/discovery-briefing/route-utils";

export const dynamic = "force-dynamic";

type ParamsShape = Promise<{ slug: string; id: string }>;

export default async function ProposalDiscoveryBriefingPage({
  params,
}: {
  params: ParamsShape;
}) {
  const { slug, id } = await params;

  if (parseBriefingId(id) == null) notFound();

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });
  if (!user) {
    redirect(
      `/admin/login?redirect=${encodeURIComponent(`/client-proposal/${slug}/discovery/${id}`)}`,
    );
  }

  const result = await resolveScopedBriefing({
    payload,
    scope: "proposal",
    slug,
    briefingId: id,
  });

  if (!result.ok) {
    if (result.kind === "redirect") redirect(result.to);
    notFound();
  }

  return (
    <DiscoveryBriefingForm
      scope="proposal"
      scopeId={Number(result.parent.id)}
      scopeLabel={result.scopeLabel}
      initialState={result.initialState}
      parentSlug={String(result.parent.slug ?? slug)}
      availableDecks={result.availableDecks}
    />
  );
}
