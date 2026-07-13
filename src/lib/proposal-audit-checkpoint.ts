export type ProposalAuditIds = Record<string, number | string | number[] | null>

export function buildAuditProgressUpdate(
  stage: string,
  percent: number,
  preservedFields: Record<string, unknown>,
) {
  return {
    auditProgress: `${stage}|${percent}`,
    ...preservedFields,
  }
}

export type CoreAuditCheckpointInput = {
  payload: {
    update: any
  }
  proposalId: string
  auditIds: ProposalAuditIds
  errors: string[]
  validationErrors: string[]
  preservedFields: Record<string, unknown>
  completedAt?: string
}

export async function persistCoreAuditCheckpoint({
  payload,
  proposalId,
  auditIds,
  errors,
  validationErrors,
  preservedFields,
  completedAt = new Date().toISOString(),
}: CoreAuditCheckpointInput): Promise<'completed' | 'failed'> {
  const allFailed = Object.values(auditIds).every((value) => value === null)
  const status = allFailed || validationErrors.length > 0 ? 'failed' : 'completed'
  const progress = allFailed
    ? 'Failed|100'
    : validationErrors.length > 0
      ? 'Report incomplete — retry required|100'
      : 'Complete|100'
  const error = validationErrors.length > 0
    ? [
        'Critical: required audit report sections are missing. Retry the audit before using this client proposal.',
        ...errors,
        ...validationErrors,
      ].join('\n')
    : errors.length > 0
      ? errors.join('\n')
      : null

  await payload.update({
    collection: 'client-proposals',
    id: proposalId,
    data: {
      auditStatus: status,
      auditProgress: progress,
      auditCompletedAt: completedAt,
      auditError: error,
      ...(auditIds.seoAudit ? { seoAudit: auditIds.seoAudit } : {}),
      ...(auditIds.croAudit ? { croAudit: auditIds.croAudit } : {}),
      ...(auditIds.keywordSnapshot ? { keywordSnapshot: auditIds.keywordSnapshot } : {}),
      ...(auditIds.competitorAnalysis ? { competitorAnalysis: auditIds.competitorAnalysis } : {}),
      ...(auditIds.contentResearch ? { contentResearch: auditIds.contentResearch } : {}),
      ...preservedFields,
    },
    overrideAccess: true,
  })

  return status
}

export function failedOptionalEnrichmentState(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return {
    status: 'failed' as const,
    error: `Optional enrichment failed: ${message}`,
  }
}
