/**
 * Public Client Discovery Briefing form page (scoped by proposal slug).
 *
 * Route: /client-proposal/<slug>/discovery/<paddedId>
 *
 * Access model
 * ------------
 * Public by default. When the briefing record has `requirePin: true`, the
 * form is wrapped in a PIN gate that checks the proposal's `proposalPin`
 * (falling back to the linked client's `clientPin` if the proposal hasn't
 * set its own) via `/api/discovery-auth`. Admin sessions bypass the gate.
 *
 * Rendering details
 * -----------------
 * - Admin viewers get the full form with Hide section controls.
 * - Public viewers get `viewerRole="client"` — Hide checkboxes are removed
 *   and hidden sections are not rendered at all.
 */

import { headers as nextHeaders } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getPayload } from "payload";
import config from "@/payload.config";
import { DiscoveryBriefingForm } from "@/components/discovery-briefing/DiscoveryBriefingForm";
import DiscoveryPinGate from "@/components/DiscoveryPinGate";
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
  const isAdmin = !!user;

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

  const form = (
    <DiscoveryBriefingForm
      scope="proposal"
      scopeId={Number(result.parent.id)}
      scopeLabel={result.scopeLabel}
      initialState={result.initialState}
      parentSlug={String(result.parent.slug ?? slug)}
      availableDecks={result.availableDecks}
      viewerRole={isAdmin ? "admin" : "client"}
    />
  );

  if (result.requirePin && !isAdmin) {
    return (
      <DiscoveryPinGate
        scope="proposal"
        slug={slug}
        briefingId={id}
        businessName={result.scopeLabel}
      >
        {form}
      </DiscoveryPinGate>
    );
  }

  return form;
}
