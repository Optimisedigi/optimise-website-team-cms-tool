import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { handleUploadMock, getPayloadMock } = vi.hoisted(() => ({ handleUploadMock: vi.fn(), getPayloadMock: vi.fn() }))
vi.mock('@vercel/blob/client', () => ({ handleUpload: handleUploadMock }))
vi.mock('payload', () => ({ getPayload: getPayloadMock }))
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))

import { POST } from '@/app/(frontend)/api/google-ads-audit-snapshots/[id]/evidence-upload/route'

const params = { params: Promise.resolve({ id: '9' }) }
const clientPayload = JSON.stringify({ checksum: 'a'.repeat(64), compressedBytes: 100, uncompressedBytes: 500 })

function request(pathname: string, headers: Record<string, string> = {}) {
  return new NextRequest('https://cms.example/api/google-ads-audit-snapshots/9/evidence-upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ type: 'blob.generate-client-token', payload: { pathname, multipart: false, clientPayload } }),
  })
}

afterEach(() => {
  vi.unstubAllEnvs()
  handleUploadMock.mockReset()
  getPayloadMock.mockReset()
})

describe('Google Ads evidence client-upload authorization', () => {
  it('requires the internal callback key before issuing a token', async () => {
    vi.stubEnv('INTERNAL_API_KEY', 'internal')
    vi.stubEnv('GOOGLE_ADS_EVIDENCE_BLOB_READ_WRITE_TOKEN', 'private-token')
    const response = await POST(request('google-ads-audits/9/datasets/campaigns.json.gz'), params)
    expect(response.status).toBe(401)
    expect(handleUploadMock).not.toHaveBeenCalled()
  })

  it('restricts tokens to the running job, allowlisted path, gzip type, exact size, and five minutes', async () => {
    vi.stubEnv('INTERNAL_API_KEY', 'internal')
    vi.stubEnv('GOOGLE_ADS_EVIDENCE_BLOB_READ_WRITE_TOKEN', 'private-token')
    getPayloadMock.mockResolvedValue({ findByID: vi.fn().mockResolvedValue({ status: 'running', growthToolsJobId: 'job-1' }) })
    let tokenOptions: Record<string, unknown> | undefined
    handleUploadMock.mockImplementation(async (options: any) => {
      tokenOptions = await options.onBeforeGenerateToken('google-ads-audits/9/datasets/campaigns.json.gz', clientPayload, false)
      return { type: 'blob.generate-client-token', clientToken: 'scoped-token' }
    })
    const before = Date.now()
    const response = await POST(request('google-ads-audits/9/datasets/campaigns.json.gz', { authorization: 'Bearer internal', 'x-snapshot-job-id': 'job-1' }), params)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ clientToken: 'scoped-token' })
    expect(handleUploadMock).toHaveBeenCalledWith(expect.objectContaining({ token: 'private-token' }))
    expect(tokenOptions).toMatchObject({ allowedContentTypes: ['application/gzip'], maximumSizeInBytes: 100, addRandomSuffix: false, allowOverwrite: true })
    expect(Number(tokenOptions?.validUntil)).toBeGreaterThanOrEqual(before + 299_000)
  })

  it('rejects cross-snapshot paths and mismatched jobs', async () => {
    vi.stubEnv('INTERNAL_API_KEY', 'internal')
    vi.stubEnv('GOOGLE_ADS_EVIDENCE_BLOB_READ_WRITE_TOKEN', 'private-token')
    getPayloadMock.mockResolvedValue({ findByID: vi.fn().mockResolvedValue({ status: 'running', growthToolsJobId: 'job-1' }) })
    const mismatch = await POST(request('google-ads-audits/9/datasets/campaigns.json.gz', { authorization: 'Bearer internal', 'x-snapshot-job-id': 'other-job' }), params)
    expect(mismatch.status).toBe(409)

    handleUploadMock.mockImplementation(async (options: any) => {
      await options.onBeforeGenerateToken('google-ads-audits/10/datasets/campaigns.json.gz', clientPayload, false)
    })
    const wrongPath = await POST(request('google-ads-audits/10/datasets/campaigns.json.gz', { authorization: 'Bearer internal', 'x-snapshot-job-id': 'job-1' }), params)
    expect(wrongPath.status).toBe(400)
  })
})
