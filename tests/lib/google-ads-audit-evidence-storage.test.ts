import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { getMock, delMock } = vi.hoisted(() => ({ getMock: vi.fn(), delMock: vi.fn() }))
vi.mock('@vercel/blob', () => ({ get: getMock, del: delMock }))

import {
  cleanupSnapshotEvidenceBlobs,
  loadPrivateGzipJson,
  loadSnapshotDataset,
  validateBlobMetadata,
} from '@/lib/google-ads-audit-snapshots/evidence-storage'

function encoded(value: unknown, pathname = 'google-ads-audits/9/datasets/campaigns.json.gz') {
  const json = Buffer.from(JSON.stringify(value))
  const compressed = gzipSync(json, { level: 9 })
  const metadata = {
    storageMode: 'private_blob_gzip_v1' as const,
    blobUrl: `https://private.example/${pathname}`,
    blobPathname: pathname,
    encoding: 'gzip' as const,
    checksum: createHash('sha256').update(json).digest('hex'),
    compressedBytes: compressed.length,
    uncompressedBytes: json.length,
  }
  return { json, compressed, metadata }
}

function blobResponse(compressed: Buffer, pathname: string) {
  return {
    statusCode: 200,
    stream: new ReadableStream({ start(controller) { controller.enqueue(compressed); controller.close() } }),
    headers: new Headers(),
    blob: { pathname, size: compressed.length, contentType: 'application/gzip', url: '', downloadUrl: '', contentDisposition: '', cacheControl: '', uploadedAt: new Date(), etag: 'etag' },
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  getMock.mockReset()
  delMock.mockReset()
})

describe('private Google Ads evidence storage', () => {
  it('retrieves private gzip by pathname and verifies decompressed checksum before parsing', async () => {
    vi.stubEnv('GOOGLE_ADS_EVIDENCE_BLOB_READ_WRITE_TOKEN', 'private-token')
    const fixture = encoded([{ id: 1 }])
    getMock.mockResolvedValue(blobResponse(fixture.compressed, fixture.metadata.blobPathname))

    await expect(loadPrivateGzipJson(fixture.metadata)).resolves.toEqual([{ id: 1 }])
    expect(getMock).toHaveBeenCalledWith(fixture.metadata.blobPathname, expect.objectContaining({ access: 'private', token: 'private-token', useCache: false }))
  })

  it('rejects corrupt checksums and bounded decompression overruns', async () => {
    vi.stubEnv('GOOGLE_ADS_EVIDENCE_BLOB_READ_WRITE_TOKEN', 'private-token')
    const fixture = encoded([{ copy: 'large value' }])
    getMock.mockResolvedValue(blobResponse(fixture.compressed, fixture.metadata.blobPathname))
    await expect(loadPrivateGzipJson({ ...fixture.metadata, checksum: '0'.repeat(64) })).rejects.toThrow('checksum mismatch')

    getMock.mockResolvedValue(blobResponse(fixture.compressed, fixture.metadata.blobPathname))
    await expect(loadPrivateGzipJson({ ...fixture.metadata, uncompressedBytes: 2 })).rejects.toThrow('decompression limit')
  })

  it('reconstructs legacy rows in chunk order and verifies every chunk', async () => {
    const first = [{ id: 1 }]
    const second = [{ id: 2 }]
    const docs = [
      { snapshot: 9, datasetKey: 'campaigns', chunkIndex: 1, rowCount: 1, checksum: createHash('sha256').update(JSON.stringify(second)).digest('hex'), rows: second, storageMode: 'database_json' },
      { snapshot: 9, datasetKey: 'campaigns', chunkIndex: 0, rowCount: 1, checksum: createHash('sha256').update(JSON.stringify(first)).digest('hex'), rows: first, storageMode: 'database_json' },
    ]
    const payload = { find: vi.fn().mockResolvedValue({ docs }) } as any
    await expect(loadSnapshotDataset(payload, 9, 'campaigns')).resolves.toEqual([{ id: 1 }, { id: 2 }])
    docs[0].checksum = '0'.repeat(64)
    await expect(loadSnapshotDataset(payload, 9, 'campaigns')).rejects.toThrow('checksum mismatch')
  })

  it('validates pathname restrictions and deletes all metadata-backed objects together', async () => {
    const fixture = encoded([])
    expect(() => validateBlobMetadata(fixture.metadata, 'google-ads-audits/9/datasets/ads.json.gz')).toThrow('pathname mismatch')
    vi.stubEnv('GOOGLE_ADS_EVIDENCE_BLOB_READ_WRITE_TOKEN', 'private-token')
    const payload = {
      findByID: vi.fn().mockResolvedValue({ analysisBlobPathname: 'google-ads-audits/9/analysis/full-analysis.json.gz' }),
      find: vi.fn().mockResolvedValue({ docs: [{ blobPathname: fixture.metadata.blobPathname }, { blobPathname: 'other-prefix/object.gz' }] }),
    } as any
    await expect(cleanupSnapshotEvidenceBlobs(payload, 9)).resolves.toBe(2)
    expect(delMock).toHaveBeenCalledWith(expect.arrayContaining([fixture.metadata.blobPathname, 'google-ads-audits/9/analysis/full-analysis.json.gz']), { token: 'private-token' })
  })
})
