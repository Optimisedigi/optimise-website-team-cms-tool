/**
 * Side-effect module: registers the `google-ads-audit-15-slide` template
 * with the deck registry on import.
 *
 * Imported by `src/lib/decks/registry.ts`. Consumers should import the
 * registry barrel rather than this file directly.
 */
import { registerTemplate } from "../../types";
import { Component } from "./Component";
import {
  googleAdsAudit15SlideSchema,
  googleAdsAudit15SlideSamplePayload,
} from "./payload";

registerTemplate({
  kind: "live",
  slug: "google-ads-audit-15-slide",
  name: "Google Ads Audit — 15-slide deck",
  description:
    "Full 15-slide Google Ads account audit deck. Cover, TL;DR, account-at-a-glance, audit score, category breakdown, non-brand trend, ad-group breakdown, search terms, landing pages, AI Overviews impact, recommendations, opportunity, how we work, working together, closing.",
  payloadSchema: googleAdsAudit15SlideSchema,
  samplePayload: googleAdsAudit15SlideSamplePayload,
  Component,
});
