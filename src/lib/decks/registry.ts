/**
 * Deck template registry — entry point.
 *
 * Importing this module triggers registration of every known template
 * (each template directory exports a side-effect `registerTemplate(...)`
 * call from its `index.ts`). Consumers then look up templates via
 * `getTemplate(slug)` / `listTemplates()`.
 *
 * Add a new template by:
 *   1. Creating `./templates/<slug>/index.ts` that calls
 *      `registerTemplate(...)` from `./types`.
 *   2. Adding the side-effect import below.
 *
 * Order of imports is irrelevant — slugs are uniqued at register time.
 */

// Side-effect imports: each module registers its template on load.
import "./templates/delivery-radius-review";
import "./templates/google-ads-audit-15-slide";
import "./templates/stakeholder-recap-5-slide";

export { getTemplate, listTemplates } from "./types";
export type {
  TemplateDef,
  LiveRenderedTemplate,
  FileEmittingTemplate,
  PayloadSchema,
} from "./types";
