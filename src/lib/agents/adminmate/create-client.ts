import type { Payload, PayloadRequest } from "payload";
import type { StagedClient } from "./tools";

export class ClientSlugConflictError extends Error {
  constructor(slug: string, ownerName: string) {
    super(`Slug "${slug}" is already used by ${ownerName}. Edit the slug and try again.`);
    this.name = "ClientSlugConflictError";
  }
}

/**
 * Writes an admin-confirmed staged client to the CMS using only the AdminMate
 * field allowlist. Shared by the create-client and create-contract routes so a
 * contract that brings a new client with it goes through the same slug
 * conflict check and field mapping.
 */
export async function createClientFromStaged(
  payload: Payload,
  staged: StagedClient,
  req: PayloadRequest,
): Promise<{ id: number; name: string; slug: string }> {
  const conflict = await payload.find({
    collection: "clients",
    where: { slug: { equals: staged.slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { name: true },
  });
  if (conflict.totalDocs > 0) {
    throw new ClientSlugConflictError(staged.slug, conflict.docs[0]?.name ?? "another client");
  }

  const created = await payload.create({
    collection: "clients",
    data: {
      name: staged.name,
      slug: staged.slug,
      tradingName: staged.tradingName ?? null,
      websiteUrl: staged.websiteUrl ?? null,
      services: staged.services ?? null,
      contactName: staged.contactName ?? null,
      contactEmail: staged.contactEmail ?? null,
      contactPhone: staged.contactPhone ?? null,
      ...(staged.clientType ? { clientType: staged.clientType } : {}),
      ...(staged.monthlyRetainer === undefined ? {} : { monthlyRetainer: staged.monthlyRetainer }),
      ...(staged.setupFee === undefined ? {} : { setupFee: staged.setupFee }),
      isActive: staged.isActive,
      ...(staged.notes ? { clientPulse: { notes: staged.notes } } : {}),
    },
    depth: 0,
    overrideAccess: false,
    req,
  });
  return { id: created.id, name: created.name, slug: created.slug };
}
