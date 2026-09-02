import type { Payload } from "payload";
import type { AdminMateClient } from "./tools";

/** Existing clients in a compact shape, used for duplicate detection and slug conflicts. */
export async function listExistingClients(payload: Payload): Promise<AdminMateClient[]> {
  const result = await payload.find({
    collection: "clients",
    sort: "name",
    limit: 1000,
    depth: 0,
    overrideAccess: true,
    select: { name: true, slug: true, websiteUrl: true },
  });
  return result.docs.flatMap((client) => typeof client.name === "string" && client.name.trim()
    ? [{
        id: String(client.id),
        name: client.name.trim(),
        slug: typeof client.slug === "string" ? client.slug : "",
        websiteUrl: typeof client.websiteUrl === "string" && client.websiteUrl ? client.websiteUrl : undefined,
      }]
    : []);
}
