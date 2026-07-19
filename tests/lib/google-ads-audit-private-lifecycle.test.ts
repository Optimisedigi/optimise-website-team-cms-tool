import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { getMock, delMock } = vi.hoisted(() => ({ getMock: vi.fn(), delMock: vi.fn() }))
vi.mock('@vercel/blob', () => ({ get: getMock, del: delMock }))

import { finalizeSnapshot, ingestSnapshotChunk } from '@/lib/google-ads-audit-snapshots/lifecycle'
import { SNAPSHOT_DATASET_KEYS, SNAPSHOT_SCHEMA_VERSION } from '@/lib/google-ads-audit-snapshots/types'
import { GOOGLE_ADS_AUDIT_CATEGORY_IDS, GOOGLE_ADS_AUDIT_RUBRIC_VERSION } from '@/lib/google-ads-audit-snapshots/scoring'

function evidence(value: unknown, pathname: string) {
  const json = Buffer.from(JSON.stringify(value))
  const compressed = gzipSync(json)
  return {
    compressed,
    metadata: {
      storageMode: 'private_blob_gzip_v1', blobUrl: `https://private.example/${pathname}`, blobPathname: pathname, encoding: 'gzip',
      checksum: createHash('sha256').update(json).digest('hex'), compressedBytes: compressed.length, uncompressedBytes: json.length,
    },
  }
}

function response(pathname: string, bytes: Buffer) {
  return { statusCode: 200, stream: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close() } }), headers: new Headers(), blob: { pathname, size: bytes.length, contentType: 'application/gzip', url: '', downloadUrl: '', contentDisposition: '', cacheControl: '', uploadedAt: new Date(), etag: 'etag' } }
}

afterEach(() => { vi.unstubAllEnvs(); getMock.mockReset(); delMock.mockReset() })

describe('private Blob snapshot lifecycle', () => {
  it('stores metadata without rows, rejects conflicting duplicates, verifies every object, and finalizes compact analysis', async () => {
    vi.stubEnv('GOOGLE_ADS_EVIDENCE_BLOB_READ_WRITE_TOKEN', 'private-token')
    const chunks: any[] = []
    const updates: any[] = []
    const objects = new Map<string, Buffer>()
    const snapshot = { id: 9, audit: 4, status: 'running', growthToolsJobId: 'job', rubricVersion: GOOGLE_ADS_AUDIT_RUBRIC_VERSION }
    const payload: any = {
      findByID: vi.fn().mockResolvedValue(snapshot),
      find: vi.fn(async ({ where }: any) => ({ docs: where?.identity ? chunks.filter((chunk) => chunk.identity === where.identity.equals) : chunks })),
      create: vi.fn(async ({ data }: any) => { chunks.push(data); return data }),
      update: vi.fn(async (args: any) => { updates.push(args); return { ...snapshot, ...args.data } }),
    }
    const manifest: any[] = []
    for (const datasetKey of SNAPSHOT_DATASET_KEYS) {
      const pathname = `google-ads-audits/9/datasets/${datasetKey}.json.gz`
      const fixture = evidence([], pathname)
      objects.set(pathname, fixture.compressed)
      const input = { jobId: 'job', schemaVersion: SNAPSHOT_SCHEMA_VERSION, datasetKey, chunkIndex: 0, rowCount: 0, ...fixture.metadata }
      await expect(ingestSnapshotChunk(payload, '9', input)).resolves.toEqual({ duplicate: false })
      await expect(ingestSnapshotChunk(payload, '9', input)).resolves.toEqual({ duplicate: true })
      manifest.push({ datasetKey, chunkIndex: 0, rowCount: 0, ...fixture.metadata })
    }
    expect(chunks.every((chunk) => !('rows' in chunk) && chunk.storageMode === 'private_blob_gzip_v1')).toBe(true)
    await expect(ingestSnapshotChunk(payload, '9', { ...manifest[0], jobId: 'job', schemaVersion: SNAPSHOT_SCHEMA_VERSION, compressedBytes: manifest[0].compressedBytes + 1 })).rejects.toThrow('Conflicting duplicate')

    const analysis = { scoring: { rubricVersion: GOOGLE_ADS_AUDIT_RUBRIC_VERSION, total: 80, categories: GOOGLE_ADS_AUDIT_CATEGORY_IDS.map((id) => ({ id })) }, searchTerms: { classified: [] } }
    const analysisPath = 'google-ads-audits/9/analysis/full-analysis.json.gz'
    const full = evidence({ ...analysis, searchTerms: { classified: [{ term: 'full row' }] } }, analysisPath)
    objects.set(analysisPath, full.compressed)
    getMock.mockImplementation(async (pathname: string) => response(pathname, objects.get(pathname)!))

    const completed = await finalizeSnapshot(payload, '9', { jobId: 'job', schemaVersion: SNAPSHOT_SCHEMA_VERSION, rubricVersion: GOOGLE_ADS_AUDIT_RUBRIC_VERSION, manifest, analysis, analysisBlob: full.metadata, capturedAt: '2026-07-18T00:00:00Z' })
    expect(completed).toMatchObject({ status: 'completed', analysis, analysisBlobPathname: analysisPath })
    expect(getMock).toHaveBeenCalledTimes(SNAPSHOT_DATASET_KEYS.length + 1)
    expect(updates.find((update) => update.collection === 'google-ads-audit-snapshots').data.analysis).toBe(analysis)
  })
})
