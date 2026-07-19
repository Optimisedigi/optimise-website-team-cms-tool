/**
 * Side-effect module: registers the `google-ads-audit-15-slide` template
 * with the deck registry on import.
 *
 * Imported by `src/lib/decks/registry.ts`. Consumers should import the
 * registry barrel rather than this file directly.
 */
import { registerTemplate } from "../../types";
import { VersionedComponent } from "./VersionedComponent";
import {
  googleAdsAudit15SlideSchema,
  googleAdsAudit15SlideSamplePayload,
} from "./payload";

registerTemplate({
  kind: "live",
  slug: "google-ads-audit-15-slide",
  name: "Google Ads Audit standardized deck",
  description:
    "Versioned semantic Google Ads audit deck with traceable evidence, conditional diagnostic slides, and visible-only numbering. Legacy Away Digital payloads remain supported.",
  payloadSchema: googleAdsAudit15SlideSchema,
  samplePayload: googleAdsAudit15SlideSamplePayload,
  Component: VersionedComponent,
});
