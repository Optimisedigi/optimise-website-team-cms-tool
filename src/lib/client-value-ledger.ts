import type { Payload } from "payload";

export interface LedgerItemInput {
  client: string | number;
  occurredAt: string;
  category: string;
  title: string;
  summary: string;
  impactType?: string | null;
  impactValue?: number | null;
  impactUnit?: string | null;
  confidence?: "measured" | "estimated" | "directional";
  visibility?: "internal" | "client_visible";
  source?: string | null;
  dedupeKey?: string | null;
  evidenceLinks?: Array<{ label: string; url: string; kind?: string | null }>;
  [key: string]: unknown;
}

export interface LedgerSummary {
  totalItems: number;
  byCategory: Record<string, number>;
  impactTotals: Record<string, number>;
  latestOccurredAt: string | null;
}

export function normaliseImpactValue(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function buildLedgerSummary(items: LedgerItemInput[]): LedgerSummary {
  const byCategory: Record<string, number> = {};
  const impactTotals: Record<string, number> = {};
  let latestOccurredAt: string | null = null;

  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    const impactValue = normaliseImpactValue(item.impactValue);
    const impactUnit = item.impactUnit || item.impactType || "uncategorised";
    if (impactValue != null) impactTotals[impactUnit] = (impactTotals[impactUnit] ?? 0) + impactValue;
    if (!latestOccurredAt || item.occurredAt > latestOccurredAt) latestOccurredAt = item.occurredAt;
  }

  return {
    totalItems: items.length,
    byCategory: Object.fromEntries(Object.entries(byCategory).sort(([a], [b]) => a.localeCompare(b))),
    impactTotals: Object.fromEntries(Object.entries(impactTotals).sort(([a], [b]) => a.localeCompare(b))),
    latestOccurredAt,
  };
}

export async function createLedgerItem(
  payload: Payload,
  input: LedgerItemInput,
): Promise<{ created: boolean; id: string | number | null }> {
  if (input.dedupeKey) {
    const existing = await payload.find({
      collection: "client-value-ledger-items" as any,
      where: { dedupeKey: { equals: input.dedupeKey } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    if (existing.docs[0]?.id != null) return { created: false, id: existing.docs[0].id };
  }

  const doc = await payload.create({
    collection: "client-value-ledger-items" as any,
    data: {
      ...input,
      impactValue: normaliseImpactValue(input.impactValue),
      confidence: input.confidence ?? "directional",
      visibility: input.visibility ?? "internal",
    } as any,
    overrideAccess: true,
  });

  return { created: true, id: doc.id };
}
