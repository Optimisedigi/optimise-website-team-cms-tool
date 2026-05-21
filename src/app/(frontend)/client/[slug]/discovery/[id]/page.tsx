/**
 * CMS-bound Client Discovery Briefing form page (scoped by client slug).
 *
 * Route: /client/<slug>/discovery/<paddedId>
 *
 * Auth-gated (admin login). Server-renders the briefing state from Payload,
 * then mounts the client component. Pre-fills `businessName` from the parent
 * client record when the saved state has none (the form no longer exposes
 * that field directly).
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

export default async function ClientDiscoveryBriefingPage({
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
      `/admin/login?redirect=${encodeURIComponent(`/client/${slug}/discovery/${id}`)}`,
    );
  }

  const result = await resolveScopedBriefing({
    payload,
    scope: "client",
    slug,
    briefingId: id,
  });

  if (!result.ok) {
    if (result.kind === "redirect") redirect(result.to);
    notFound();
  }

  // Find the parent's id so the form's API calls keep working — the by-scope
  // API contract uses the *parent* id, not the briefing id.
  return (
    <DiscoveryBriefingForm
      scope="client"
      scopeId={Number(result.parent.id)}
      scopeLabel={result.scopeLabel}
      initialState={result.initialState}
      parentSlug={String(result.parent.slug ?? slug)}
      availableDecks={result.availableDecks}
    />
  );
}
