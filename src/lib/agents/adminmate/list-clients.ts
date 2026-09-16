import type { Payload } from "payload";
import type { AdminMateClient } from "./tools";

/**
 * Existing clients in a compact shape. Used for duplicate detection, slug
 * conflicts, and — when drafting a contract — picking an existing active or
 * inactive client and pre-filling the contract's client details from it.
 */
export async function listExistingClients(payload: Payload): Promise<AdminMateClient[]> {
  const result = await payload.find({
    collection: "clients",
    sort: "name",
    limit: 1000,
    depth: 0,
    overrideAccess: true,
    select: {
      name: true,
      slug: true,
      websiteUrl: true,
      tradingName: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      monthlyRetainer: true,
      setupFee: true,
      isActive: true,
    },
  });
  const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  const money = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
  return result.docs.flatMap((client) => typeof client.name === "string" && client.name.trim()
    ? [{
        id: String(client.id),
        name: client.name.trim(),
        slug: typeof client.slug === "string" ? client.slug : "",
        websiteUrl: text(client.websiteUrl),
        tradingName: text(client.tradingName),
        contactName: text(client.contactName),
        contactEmail: text(client.contactEmail),
        contactPhone: text(client.contactPhone),
        monthlyRetainer: money(client.monthlyRetainer),
        setupFee: money(client.setupFee),
        isActive: client.isActive !== false,
      }]
    : []);
}
