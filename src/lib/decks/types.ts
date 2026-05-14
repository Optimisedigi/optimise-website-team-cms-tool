/**
 * Deck template registry — shared types.
 *
 * A "deck template" is a reusable React component that renders a slide
 * deck from a typed payload. Templates are registered at module load time
 * (see `./registry.ts`) and looked up by slug by:
 *
 *   - the CMS `deck-templates` collection (admin UI metadata),
 *   - the live `/partners/[clientSlug]/[deckSlug]/` catch-all route,
 *   - the `/partners/_preview/[templateSlug]/` admin preview route,
 *   - the agent `propose_deck_from_template` tool and its apply handler.
 *
 * The registry holds two shapes:
 *
 *   1. `LiveRenderedTemplate` — preferred. Exposes a React component
 *      that receives the validated payload at request time. Works in
 *      production (no filesystem writes) and lets the catch-all route
 *      render a deck from CMS data alone.
 *
 *   2. `FileEmittingTemplate` — legacy. Returns `{ pageTsx, globalsCss }`
 *      strings that an apply handler writes to disk. Local-dev only
 *      (Vercel filesystem is read-only). The existing `stakeholder-deck`
 *      apply handler uses this shape; new templates should not.
 *
 * Both shapes share the same identity/metadata fields (`slug`, `name`,
 * `description`, `payloadSchema`, `samplePayload`) so the CMS admin and
 * preview route can treat them uniformly. Discriminated on `kind`.
 */
import type { ComponentType } from "react";

/**
 * Validator + parser for a template's payload. Mirrors the surface area
 * of a Zod schema's `parse`/`safeParse` so callers (preview route, tool,
 * apply handler) can validate untrusted JSON without depending on a
 * specific validation library.
 *
 * Implementations should:
 *   - return the *typed* payload on success (after coercing/cleaning),
 *   - throw a `TypeError` with a human-readable message on failure
 *     (`parse`), or return `{ ok: false, error }` (`safeParse`).
 */
export interface PayloadSchema<TPayload> {
  /** Best-effort human label for error messages, e.g. "google-ads-audit-15-slide payload". */
  readonly name: string;
  parse(input: unknown): TPayload;
  safeParse(
    input: unknown,
  ):
    | { ok: true; value: TPayload }
    | { ok: false; error: string };
}

/**
 * Fields every template carries, regardless of render strategy.
 */
interface TemplateBase<TPayload> {
  /** Kebab-case identifier — stable, never re-used. Matches the
   *  `deck-templates` collection row's `templateSlug` field. */
  readonly slug: string;
  /** Human label shown in the CMS picker. */
  readonly name: string;
  /** One-line summary of what the template is for. */
  readonly description: string;
  /** Validator/parser for the payload this template consumes. */
  readonly payloadSchema: PayloadSchema<TPayload>;
  /** Fully-populated example payload — used to render the preview
   *  route's default view and to seed the CMS admin's JSON field. */
  readonly samplePayload: TPayload;
}

/**
 * Live-rendered template. The catch-all route imports the registry,
 * looks up the slug, validates `deckPayload` from the CMS, and renders
 * the Component with the typed payload. No filesystem writes.
 */
export interface LiveRenderedTemplate<TPayload> extends TemplateBase<TPayload> {
  readonly kind: "live";
  /** React component that consumes the validated payload. Rendered
   *  inside the catch-all route and the preview route. */
  readonly Component: ComponentType<{ payload: TPayload }>;
}

/**
 * File-emitting template. The apply handler invokes `render(payload)`
 * to get verbatim `page.tsx` and (optional) `globals.css` strings and
 * writes them under `src/app/(frontend)/partners/...`. Local-dev only.
 * Retained for backwards compat with the existing `stakeholder-deck`
 * apply handler; new templates should not use this shape.
 */
export interface FileEmittingTemplate<TPayload> extends TemplateBase<TPayload> {
  readonly kind: "file";
  render(payload: TPayload): { pageTsx: string; globalsCss?: string };
}

/** Union of every template shape the registry holds. */
export type TemplateDef<TPayload = unknown> =
  | LiveRenderedTemplate<TPayload>
  | FileEmittingTemplate<TPayload>;

/** Module-scoped registry. Populated by side-effect imports in
 *  `./registry.ts`. Keyed by `slug`. */
export type TemplateRegistry = Map<string, TemplateDef>;

const REGISTRY: TemplateRegistry = new Map();

/**
 * Register a deck template at module load. Throws if `slug` is already
 * taken — templates are append-only; a breaking schema change must
 * produce a NEW slug (e.g. `google-ads-audit-15-slide-v2`), never
 * overwrite an existing one.
 */
export function registerTemplate<TPayload>(
  template: TemplateDef<TPayload>,
): void {
  if (REGISTRY.has(template.slug)) {
    throw new Error(
      `Deck template slug "${template.slug}" is already registered. ` +
        `Templates are append-only; pick a new slug (e.g. "${template.slug}-v2") ` +
        `for breaking schema changes.`,
    );
  }
  // Internal map stores TemplateDef<unknown>; we widen here for storage.
  REGISTRY.set(template.slug, template as TemplateDef<unknown>);
}

/** Look up a template by slug. Returns `undefined` if unknown. */
export function getTemplate(slug: string): TemplateDef | undefined {
  return REGISTRY.get(slug);
}

/** List every registered template, sorted by slug for deterministic
 *  output (admin UI lists, registry-vs-collection drift checks). */
export function listTemplates(): TemplateDef[] {
  return [...REGISTRY.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Test/dev escape hatch — clear the registry. Not exported through
 *  the registry barrel; only intended for vitest setup files. */
export function _resetRegistryForTests(): void {
  REGISTRY.clear();
}
