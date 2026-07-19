import { Component as LegacyComponent } from "./Component";
import { buildV1PayloadFromEvidence } from "./evidence-to-v1";
import type { GoogleAdsAudit15SlidePayload, GoogleAdsAuditTemplatePayload, SemanticGoogleAdsAuditPayload } from "./payload";

// Evidence-backed (version-2) snapshots are adapted into the rich v1 payload so
// the published deck renders through the established Google Ads audit design.
export function VersionedComponent({ payload, previewSlideId }: { payload: GoogleAdsAuditTemplatePayload; previewSlideId?: string }) {
  if ((payload as SemanticGoogleAdsAuditPayload).version === 2) {
    return <LegacyComponent payload={buildV1PayloadFromEvidence(payload as SemanticGoogleAdsAuditPayload)} previewSlideId={previewSlideId} />;
  }
  return <LegacyComponent payload={payload as GoogleAdsAudit15SlidePayload} previewSlideId={previewSlideId} />;
}
