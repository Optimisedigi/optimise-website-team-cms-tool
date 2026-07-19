import { afterEach, describe, expect, it, vi } from 'vitest'

const { getPayloadMock, putMock, loadDatasetMock, loadPrivateMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn(), putMock: vi.fn(), loadDatasetMock: vi.fn(), loadPrivateMock: vi.fn() }))
vi.mock('payload', () => ({ getPayload: getPayloadMock }))
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))
vi.mock('@vercel/blob', () => ({ put: putMock }))
vi.mock('@/lib/google-ads-audit-snapshots/evidence-storage', () => ({ loadSnapshotDataset: loadDatasetMock, loadPrivateGzipJson: loadPrivateMock }))

import { backfillGoogleAdsAuditEvidence, optionsFromArgs } from '@/scripts/backfill-google-ads-audit-evidence-blobs'
import { SNAPSHOT_DATASET_KEYS } from '@/lib/google-ads-audit-snapshots/types'

afterEach(() => { vi.unstubAllEnvs(); getPayloadMock.mockReset(); putMock.mockReset(); loadDatasetMock.mockReset(); loadPrivateMock.mockReset() })

describe('Google Ads evidence backfill safeguards', () => {
  it('defaults snapshot 7 to dry-run and requires apply for destructive cleanup', () => {
    expect(optionsFromArgs([])).toEqual({ snapshotId: '7', apply: false, clearLegacyRows: false })
    expect(() => optionsFromArgs(['--clear-legacy-rows'])).toThrow('requires --apply')
    expect(optionsFromArgs(['--snapshot-id', '12', '--apply', '--clear-legacy-rows'])).toEqual({ snapshotId: '12', apply: true, clearLegacyRows: true })
  })

  it('measures all datasets and full analysis without uploading or writing in dry-run mode', async () => {
    const payload = { findByID: vi.fn().mockResolvedValue({ status: 'completed', analysis: { searchTerms: { classified: [] } } }), update: vi.fn(), find: vi.fn(), delete: vi.fn() }
    getPayloadMock.mockResolvedValue(payload)
    loadDatasetMock.mockResolvedValue([])
    const report = await backfillGoogleAdsAuditEvidence({ snapshotId: '7', apply: false, clearLegacyRows: false })
    expect(report).toMatchObject({ snapshotId: '7', mode: 'dry-run', datasetCount: SNAPSHOT_DATASET_KEYS.length })
    expect(loadDatasetMock).toHaveBeenCalledTimes(SNAPSHOT_DATASET_KEYS.length)
    expect(putMock).not.toHaveBeenCalled()
    expect(payload.update).not.toHaveBeenCalled()
  })
})
