import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getPayloadMock, loadDatasetMock } = vi.hoisted(() => ({ getPayloadMock: vi.fn(), loadDatasetMock: vi.fn() }))
vi.mock('payload', () => ({ getPayload: getPayloadMock }))
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))
vi.mock('@/lib/google-ads-audit-snapshots/evidence-storage', () => ({ loadSnapshotDataset: loadDatasetMock }))

import { GET } from '@/app/(frontend)/api/google-ads-audit-snapshots/[id]/datasets/[datasetKey]/route'

function request(query = '') { return new NextRequest(`https://cms.example/api/google-ads-audit-snapshots/9/datasets/campaigns${query}`) }

afterEach(() => { getPayloadMock.mockReset(); loadDatasetMock.mockReset() })

describe('authenticated snapshot dataset retrieval route', () => {
  it('rejects unauthenticated requests before loading evidence', async () => {
    getPayloadMock.mockResolvedValue({ auth: vi.fn().mockResolvedValue({ user: null }) })
    const response = await GET(request(), { params: Promise.resolve({ id: '9', datasetKey: 'campaigns' }) })
    expect(response.status).toBe(401)
    expect(loadDatasetMock).not.toHaveBeenCalled()
  })

  it('returns transparent JSON and supports an attachment response', async () => {
    getPayloadMock.mockResolvedValue({ auth: vi.fn().mockResolvedValue({ user: { id: 1 } }) })
    loadDatasetMock.mockResolvedValue([{ id: 1 }])
    const response = await GET(request('?download=1'), { params: Promise.resolve({ id: '9', datasetKey: 'campaigns' }) })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toContain('attachment')
    await expect(response.json()).resolves.toEqual([{ id: 1 }])
  })

  it('rejects unknown datasets and surfaces integrity failures', async () => {
    getPayloadMock.mockResolvedValue({ auth: vi.fn().mockResolvedValue({ user: { id: 1 } }) })
    const unknown = await GET(request(), { params: Promise.resolve({ id: '9', datasetKey: 'unknown' }) })
    expect(unknown.status).toBe(404)
    loadDatasetMock.mockRejectedValue(new Error('Private evidence checksum mismatch'))
    const corrupt = await GET(request(), { params: Promise.resolve({ id: '9', datasetKey: 'campaigns' }) })
    expect(corrupt.status).toBe(422)
  })
})
