/**
 * Public Client Discovery Briefing form page (scoped by client slug).
 *
 * Route: /client/<slug>/discovery/<paddedId>
 *
 * Access model
 * ------------
 * Public by default. When the briefing record has `requirePin: true`, the
 * form is wrapped in a PIN gate that checks the client's `clientPin` via
 * `/api/discovery-auth`. Admin sessions bypass the gate entirely (so the
 * team can keep editing without re-typing the PIN).
 *
 * Rendering details
 * -----------------
 * - Server-renders the briefing state from Payload, then mounts the client
 *   component.
 * - Admin viewers get the full form (Hide section checkboxes, hidden
 *   section subtitle pill, all sections rendered).
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

export default async function ClientDiscoveryBriefingPage({
  params,
}: {
  params: ParamsShape;
}) {
  const { slug, id } = await params;

  if (parseBriefingId(id) == null) notFound();

  const payloadConfig = await config;
  const payload = await getPayload({ config: payloadConfig });

  // Detect whether the request carries an admin session (used to bypass the
  // PIN gate and surface the admin-only Hide section controls).
  const headersList = await nextHeaders();
  const { user } = await payload.auth({ headers: headersList });
  const isAdmin = !!user;

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

  const form = (
    <DiscoveryBriefingForm
      scope="client"
      scopeId={Number(result.parent.id)}
      scopeLabel={result.scopeLabel}
      initialState={result.initialState}
      parentSlug={String(result.parent.slug ?? slug)}
      availableDecks={result.availableDecks}
      viewerRole={isAdmin ? "admin" : "client"}
    />
  );

  // PIN gate triggers when the briefing opts in AND the viewer is not an
  // admin. An admin in their browser session sees the form immediately.
  if (result.requirePin && !isAdmin) {
    return (
      <DiscoveryPinGate
        scope="client"
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
