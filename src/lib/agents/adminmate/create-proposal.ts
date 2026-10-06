import type { Payload, PayloadRequest } from 'payload'
import type { StagedProposal } from './proposal-tools'

export class ProposalSlugConflictError extends Error {
  constructor(slug: string, ownerName: string) {
    super(`Slug "${slug}" is already used by ${ownerName}. Edit the slug and try again.`)
    this.name = 'ProposalSlugConflictError'
  }
}

/**
 * Writes an admin-confirmed staged client proposal to the CMS using only the
 * AdminMate field allowlist. Audit, keyword, mockup and tracking fields are
 * never set here — they stay admin-only.
 */
export async function createProposalFromStaged(
  payload: Payload,
  staged: StagedProposal,
  req: PayloadRequest,
): Promise<{ id: number; businessName: string; slug: string }> {
  const conflict = await payload.find({
    collection: 'client-proposals',
    where: { slug: { equals: staged.slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: { businessName: true },
  })
  if (conflict.totalDocs > 0) {
    throw new ProposalSlugConflictError(
      staged.slug,
      conflict.docs[0]?.businessName ?? 'another proposal',
    )
  }

  const created = await payload.create({
    collection: 'client-proposals',
    data: {
      businessName: staged.businessName,
      slug: staged.slug,
      websiteUrl: staged.websiteUrl,
      contactName: staged.contactName ?? null,
      contactEmail: staged.contactEmail ?? null,
      ...(staged.businessType ? { businessType: staged.businessType } : {}),
      ...(staged.conversionGoal ? { conversionGoal: staged.conversionGoal } : {}),
      businessGoals: staged.businessGoals ?? null,
      notes: staged.notes ?? null,
    },
    depth: 0,
    overrideAccess: false,
    req,
  })
  return { id: created.id, businessName: created.businessName, slug: created.slug }
}
