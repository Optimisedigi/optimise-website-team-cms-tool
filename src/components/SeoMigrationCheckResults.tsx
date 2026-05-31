'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import SeoMigrationCheckView, { type MigrationResult } from './SeoMigrationCheckView'

/**
 * Payload `ui` field rendered on the Post-Migration SEO Review document. Reads
 * the stored JSON fields off the doc and renders the shared results view.
 */
const SeoMigrationCheckResults = () => {
  const { initialData } = useDocumentInfo()
  const data = (initialData ?? {}) as Record<string, unknown>

  if (!data || (data.status && data.status !== 'completed')) {
    return (
      <div style={{ color: '#6b7280', padding: 16, fontSize: 13 }}>
        {data?.status === 'failed'
          ? `This review failed: ${(data.error as string) || 'unknown error'}`
          : data?.status === 'running'
            ? 'Review is running — reload in a moment.'
            : 'Run this review from the SEO hub to populate results.'}
      </div>
    )
  }

  const result: MigrationResult = {
    siteUrl: data.siteUrl as string | undefined,
    cutoverDate: data.cutoverDate as string | undefined,
    isDomainMove: data.isDomainMove as boolean | undefined,
    overallScore: data.overallScore as number | undefined,
    scoresByPhase: data.scoresByPhase as Record<string, number> | undefined,
    checklist: data.checklist as MigrationResult['checklist'],
    actions: data.actions as MigrationResult['actions'],
    performance: data.performance as MigrationResult['performance'],
    runAt: data.runAt as string | undefined,
  }

  return (
    <div style={{ marginTop: 8 }}>
      <SeoMigrationCheckView result={result} />
    </div>
  )
}

export default SeoMigrationCheckResults
