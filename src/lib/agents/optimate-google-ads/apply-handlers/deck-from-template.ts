/**
 * Apply handler: deck-from-template
 *
 * Generic counterpart to the legacy `stakeholder-deck` handler. Where
 * the legacy handler writes `page.tsx` + `globals.css` to disk (and
 * therefore can't run on Vercel's read-only filesystem), this one
 * appends a row to the target client's `presentations[]` array and
 * relies on the catch-all route
 * `/partners/[clientSlug]/[deckSlug]/page.tsx` to render the deck live
 * from CMS data. No filesystem writes, so it works in production.
 *
 * Expected payload (queued by `propose_deck_from_template`):
 *   {
 *     clientId: number,
 *     templateSlug: string,   // registered template slug (registry key)
 *     deckSlug: string,       // kebab-case, unique within the client
 *     title: string,          // display title for the presentations row
 *     payload: unknown,       // already validated at propose-time, but
 *                             //   we re-validate here as defence in depth
 *   }
 */

import type {
  ApplyHandler,
  ApplyHandlerResult,
} from "@/lib/agents/_shared/apply-dispatcher";
import { getTemplate } from "@/lib/decks/registry";

interface PresentationRow {
  title?: string | null;
  deckSlug?: string | null;
  presentedOn?: string | null;
  kind?: string | null;
  isPublic?: boolean | null;
  templateSlug?: unknown;
  deckPayload?: unknown;
  notes?: string | null;
}

export const applyDeckFromTemplate: ApplyHandler = async (
  rawPayload,
  ctx,
): Promise<ApplyHandlerResult> => {
  const { payload: pl } = ctx;

  // ── 1. Read + validate the queued payload shape ──────────────────────────
  const clientId = rawPayload.clientId as number | string | undefined;
  if (clientId === undefined || clientId === null || clientId === "") {
    throw new Error("deck-from-template: payload missing clientId");
  }

  const templateSlug = String(rawPayload.templateSlug ?? "").trim();
  if (!templateSlug) {
    throw new Error("deck-from-template: payload missing templateSlug");
  }

  const deckSlug = String(rawPayload.deckSlug ?? "").trim();
  if (!deckSlug) {
    throw new Error("deck-from-template: payload missing deckSlug");
  }

  const title = String(rawPayload.title ?? "").trim();
  if (!title) {
    throw new Error("deck-from-template: payload missing title");
  }

  // The propose-tool stored the validated payload under `payload`.
  if (rawPayload.payload === undefined) {
    throw new Error("deck-from-template: payload missing nested payload");
  }
  const deckPayloadRaw = rawPayload.payload;

  // ── 2. Template must still exist in the registry ─────────────────────────
  const template = getTemplate(templateSlug);
  if (!template) {
    throw new Error(
      `deck-from-template: registered template "${templateSlug}" not found. ` +
        `It may have been removed from src/lib/decks/registry.ts since the proposal was queued.`,
    );
  }

  // ── 3. Re-validate the payload against the template schema ───────────────
  //   The propose tool already validated, but rows can sit in the queue for
  //   days/weeks; defence in depth catches tampering or schema drift.
  const parsed = template.payloadSchema.safeParse(deckPayloadRaw);
  if (!parsed.ok) {
    throw new Error(
      `deck-from-template: payload failed re-validation against template "${templateSlug}": ${parsed.error}`,
    );
  }

  // ── 4. Resolve the deck-templates collection row id ──────────────────────
  //   The `presentations[].templateSlug` field is a relationship → it stores
  //   the deck-templates doc id, NOT the registry slug. Look it up by the
  //   collection's `templateSlug` text field (unique).
  const tmplLookup = await pl.find({
    collection: "deck-templates" as never,
    where: { templateSlug: { equals: templateSlug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const tmplDoc = tmplLookup.docs[0] as { id?: number | string } | undefined;
  if (!tmplDoc || tmplDoc.id === undefined || tmplDoc.id === null) {
    throw new Error(
      `deck-from-template: no deck-templates collection row with templateSlug "${templateSlug}". ` +
        `Create one in the CMS admin before applying.`,
    );
  }
  const templateRefId = tmplDoc.id;

  // ── 5. Load the client + idempotency guard ───────────────────────────────
  const clientDoc = (await pl.findByID({
    collection: "clients",
    id: clientId as never,
    overrideAccess: true,
    depth: 0,
  })) as unknown as {
    id: number | string;
    presentations?: PresentationRow[] | null;
  } | null;

  if (!clientDoc) {
    throw new Error(`deck-from-template: client #${clientId} not found`);
  }

  const existing: PresentationRow[] = Array.isArray(clientDoc.presentations)
    ? (clientDoc.presentations as PresentationRow[])
    : [];

  if (existing.some((p) => p?.deckSlug === deckSlug)) {
    throw new Error(
      `deck-from-template: client #${clientId} already has a presentation with deckSlug "${deckSlug}". ` +
        `Pick a different deckSlug or remove the existing row before re-applying.`,
    );
  }

  // ── 6. Append the new presentation row ───────────────────────────────────
  const newRow: PresentationRow = {
    title,
    deckSlug,
    presentedOn: new Date().toISOString(),
    kind: "deck",
    isPublic: true,
    templateSlug: templateRefId,
    deckPayload: parsed.value,
  };

  const nextPresentations: PresentationRow[] = [...existing, newRow];

  await pl.update({
    collection: "clients",
    id: clientDoc.id as never,
    data: { presentations: nextPresentations } as never,
    overrideAccess: true,
  });

  return {
    message: `Appended deck "${title}" (slug: ${deckSlug}) to client #${clientId} using template "${templateSlug}".`,
    detail: {
      clientId,
      deckSlug,
      templateSlug,
      templateRefId,
      title,
      presentationCount: nextPresentations.length,
    },
  };
};
