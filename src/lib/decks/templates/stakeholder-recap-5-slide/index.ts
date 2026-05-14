/**
 * Side-effect module: registers the `stakeholder-recap-5-slide` template
 * with the deck registry on import.
 *
 * Imported by `src/lib/decks/registry.ts`. Consumers should import the
 * registry barrel rather than this file directly.
 */
import { registerTemplate } from "../../types";
import { Component } from "./Component";
import {
  stakeholderRecap5SlideSchema,
  stakeholderRecap5SlideSamplePayload,
} from "./payload";

registerTemplate({
  kind: "live",
  slug: "stakeholder-recap-5-slide",
  name: "Stakeholder Recap — 5-slide deck",
  description:
    "5-slide stakeholder/owner recap: cover, what we shipped, leads, keywords, what is next. Reuses the existing MTP/Berendsen slide primitives.",
  payloadSchema: stakeholderRecap5SlideSchema,
  samplePayload: stakeholderRecap5SlideSamplePayload,
  Component,
});
