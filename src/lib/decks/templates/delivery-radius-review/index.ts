/**
 * Side-effect module: registers the `delivery-radius-review` template with
 * the deck registry on import.
 *
 * Used for "pick-up vs delivery radius" reviews for clients with a
 * physical storefront + local delivery (cafés, bakeries, patisseries, etc.).
 * Designed for the Profiterole Patisserie Roselands review but reusable
 * for any client where you want to compare in-store pick-up against
 * delivery sales within a defined geographic radius.
 */
import { registerTemplate } from "../../types";
import { Component } from "./Component";
import {
  deliveryRadiusReviewSchema,
  deliveryRadiusReviewSamplePayload,
} from "./payload";

registerTemplate({
  kind: "live",
  slug: "delivery-radius-review",
  name: "Delivery Radius Review",
  description:
    "Slide deck for storefront + local-delivery radius reviews. Cover, 3 km suburb/postcode table + map, monthly Delivery vs Pick-up bar chart, channel comparison with free/paid delivery split, and a combined GSC + GA4 + Google Ads click-through summary.",
  payloadSchema: deliveryRadiusReviewSchema,
  samplePayload: deliveryRadiusReviewSamplePayload,
  Component,
});