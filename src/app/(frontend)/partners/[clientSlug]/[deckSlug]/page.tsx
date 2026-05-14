import { notFound } from "next/navigation";
import { getPayload } from "payload";
import configPromise from "@/payload.config";
import AuditPasswordGate from "@/components/AuditPasswordGate";
import { getTemplate } from "@/lib/decks/registry";

export const dynamic = "force-dynamic";

type TemplateRef =
  | string
  | number
  | { id?: string | number; slug?: string; templateSlug?: string }
  | null
  | undefined;

type Presentation = {
  deckSlug?: string;
  deckUrl?: string;
  title?: string;
  templateSlug?: TemplateRef;
  deckPayload?: unknown;
};

/**
 * Extract the deck-slug segment from a full deck URL.
 * Accepts:
 *   https://cms.optimisedigital.online/partners/acme/google-ads-audit/
 *   /partners/acme/google-ads-audit/
 *   google-ads-audit  (falls back to using it directly)
 */
function extractDeckSlug(deckSlug: string, deckUrl?: string): string {
  // 1. If deckSlug is set and deckUrl is not, use it as-is (legacy records).
  if (deckSlug && !deckUrl) return deckSlug;
  // 2. If deckUrl is set, parse it.
  if (deckUrl) {
    try {
      const href = deckUrl.startsWith('http') ? deckUrl : `https://example.com${deckUrl}`;
      const { pathname } = new URL(href);
      const parts = pathname.replace(/^\/partners\//, '').split('/').filter(Boolean);
      if (parts.length >= 2) return parts[1];
    } catch {
      // fall through
    }
  }
  // 3. Fallback: use deckSlug as-is.
  return deckSlug;
}

/**
 * Resolve a relationship value to (a) the related document's id (when depth=0
 * returned an id) or (b) the already-populated `templateSlug` string when
 * depth>0 returned a full document. Returns `{ id?, templateSlug? }`.
 */
function resolveTemplateRef(ref: TemplateRef): {
  id: string | null;
  templateSlug: string | null;
} {
  if (ref == null) return { id: null, templateSlug: null };
  if (typeof ref === "string") return { id: ref, templateSlug: null };
  if (typeof ref === "number") return { id: String(ref), templateSlug: null };
  if (typeof ref === "object") {
    const id =
      typeof ref.id === "string"
        ? ref.id
        : typeof ref.id === "number"
          ? String(ref.id)
          : null;
    const templateSlug =
      typeof ref.templateSlug === "string" ? ref.templateSlug : null;
    return { id, templateSlug };
  }
  return { id: null, templateSlug: null };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ clientSlug: string; deckSlug: string }>;
}) {
  const { clientSlug, deckSlug } = await params;
  return {
    title: `${clientSlug} — ${deckSlug}`,
    robots: { index: false, follow: false },
  };
}

export default async function PartnerDeckPage({
  params,
}: {
  params: Promise<{ clientSlug: string; deckSlug: string }>;
}) {
  const { clientSlug, deckSlug } = await params;

  const payload = await getPayload({ config: configPromise });
  const clientsResult = await payload.find({
    collection: "clients",
    where: { slug: { equals: clientSlug } },
    limit: 1,
    depth: 0,
  });
  const client = clientsResult.docs[0];
  if (!client) notFound();

  const presentations =
    (client as { presentations?: Presentation[] }).presentations ?? [];

  // Find presentation whose deckSlug or parsed deckUrl matches the URL param.
  // Also pass deckSlug+deckUrl so we can normalise inside.
  const presentation = presentations.find((p) => {
    const normalisedSlug = extractDeckSlug(p.deckSlug ?? '', p.deckUrl);
    return normalisedSlug === deckSlug;
  });
  if (!presentation) notFound();

  // templateSlug is a relationship to `deck-templates`. With depth=0 Payload
  // returns just the id; with depth>0 it returns the full populated doc.
  // Handle both shapes.
  const { id: templateRefId, templateSlug: populatedSlug } = resolveTemplateRef(
    presentation.templateSlug,
  );

  let templateSlug: string | null = populatedSlug;
  if (!templateSlug) {
    if (!templateRefId) notFound();
    const tmplDoc = await payload.findByID({
      // `deck-templates` collection not yet in generated Payload types.
      collection: "deck-templates" as never,
      id: templateRefId,
      depth: 0,
    });
    templateSlug = (tmplDoc as { templateSlug?: string })?.templateSlug ?? null;
  }
  if (!templateSlug) notFound();

  const template = getTemplate(templateSlug);
  if (!template || template.kind !== "live") notFound();

  const parsed = template.payloadSchema.safeParse(presentation.deckPayload);
  if (!parsed.ok) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui", color: "#b91c1c" }}>
        <h1>Deck payload invalid</h1>
        <p>
          The presentation&apos;s deckPayload does not match the template
          schema:
        </p>
        <pre style={{ whiteSpace: "pre-wrap" }}>{parsed.error}</pre>
      </div>
    );
  }

  const Component = template.Component;
  const businessName = (client as { name?: string }).name ?? clientSlug;
  return (
    <AuditPasswordGate
      auditSlug={`${clientSlug}/${deckSlug}`}
      businessName={businessName}
      featureLabel={presentation.title ?? "Presentation"}
    >
      <Component payload={parsed.value} />
    </AuditPasswordGate>
  );
}
