import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock payload
const mockPayload = {
  find: vi.fn(),
  findByID: vi.fn(),
  findGlobal: vi.fn(),
  create: vi.fn(),
  auth: vi.fn(),
  logger: { error: vi.fn() },
}

vi.mock('payload', () => ({
  getPayload: vi.fn(() => Promise.resolve(mockPayload)),
}))

vi.mock('@/payload.config', () => ({
  default: Promise.resolve({}),
}))

vi.mock('@/lib/sheets-service', () => ({
  extractSpreadsheetId: vi.fn((url: string) => url ? 'sheet-id-123' : null),
  readSheetLists: vi.fn(() => Promise.resolve([
    { name: 'General', column: 'B', regex: '' },
    { name: 'Competitors', column: 'C', regex: '' },
  ])),
  readExistingKeywords: vi.fn(() => Promise.resolve([])),
}))

vi.mock('@/lib/activity-log', () => ({
  logActivity: vi.fn(() => Promise.resolve()),
}))

import { GET } from '@/app/(frontend)/api/negative-sweep/cron/route'
import { NextRequest } from 'next/server'

const CRON_SECRET = 'test-cron-secret'

function makeRequest(params?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3001/api/negative-sweep/cron')
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }
  return new NextRequest(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  })
}

// Sample Growth Tools response
const growthToolsCandidates = [
  {
    searchTerm: 'plumber salary',
    campaignName: 'Plumbing Services',
    adGroupName: 'General',
    clicks: 12,
    impressions: 200,
    cost: 15.50,
    conversions: 0,
    matchType: 'PHRASE',
  },
  {
    searchTerm: 'how to fix tap diy',
    campaignName: 'Plumbing Services',
    adGroupName: 'Emergency',
    clicks: 8,
    impressions: 150,
    cost: 10.20,
    conversions: 0,
    matchType: 'EXACT',
  },
  {
    searchTerm: 'plumber near me',
    campaignName: 'Plumbing Services',
    adGroupName: 'Local',
    clicks: 25,
    impressions: 400,
    cost: 30.00,
    conversions: 0,
    matchType: 'EXACT',
  },
]

// Sample Kimi AI response
const kimiClassification = [
  {
    searchTerm: 'plumber salary',
    isCandidate: true,
    suggestedNegative: 'salary',
    matchType: 'phrase',
    suggestedList: 'General',
    reasoning: 'Job seeker intent, not looking for plumbing services',
  },
  {
    searchTerm: 'how to fix tap diy',
    isCandidate: true,
    suggestedNegative: 'diy',
    matchType: 'phrase',
    suggestedList: 'General',
    reasoning: 'DIY intent, unlikely to hire a plumber',
  },
  {
    searchTerm: 'plumber near me',
    isCandidate: false,
    suggestedNegative: '',
    matchType: 'exact',
    suggestedList: '',
    reasoning: 'High-intent local search, relevant to business',
  },
]

const mockClient = {
  id: '1',
  name: 'Test Plumber',
  websiteUrl: 'https://testplumber.com',
  googleAdsCustomerId: '955-493-5739',
  brandKeywords: 'test plumber\ntestplumber',
  gadsAuto: {
    negativeSweepEnabled: true,
    negativeSweepWeekday: 'monday',
    negativeSweepMinSpendThreshold: 5,
    negativeSweepExcludeTerms: '',
    negativeSweepSheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-id-123/edit',
  },
}

describe('GET /api/negative-sweep/cron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = CRON_SECRET
    process.env.GROWTH_TOOLS_URL = 'https://growth-tools.test'
    process.env.INTERNAL_API_KEY = 'test-key'
    process.env.KIMI_API_KEY = 'test-kimi-key'

    // Default: no existing candidates
    mockPayload.find.mockResolvedValue({ docs: [] })
    mockPayload.create.mockResolvedValue({ id: '1' })
    mockPayload.findGlobal.mockResolvedValue({ refreshToken: 'test-refresh' })

    // Mock fetch for Growth Tools + Kimi
    globalThis.fetch = vi.fn()
  })

  // ─── Auth ─────────────────────────────────────────────────

  it('returns 500 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('CRON_SECRET not configured')
  })

  it('returns 401 when no authorization header', async () => {
    const req = new NextRequest('http://localhost:3001/api/negative-sweep/cron', {
      method: 'GET',
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 when token is wrong', async () => {
    const req = new NextRequest('http://localhost:3001/api/negative-sweep/cron', {
      method: 'GET',
      headers: { Authorization: 'Bearer wrong-token' },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  // ─── Force mode ───────────────────────────────────────────

  it('processes a specific client in force mode', async () => {
    mockPayload.findByID.mockResolvedValue(mockClient)

    // First find call: check existing candidates (none)
    // Second find call might not happen since we use findByID for force mode
    mockPayload.find.mockResolvedValue({ docs: [] })

    // Mock Growth Tools response
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ candidates: growthToolsCandidates }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: JSON.stringify(kimiClassification) } }],
        }),
      })

    const res = await GET(makeRequest({ clientId: '1', force: 'true' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.clientsProcessed).toBe(1)
    expect(mockPayload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'clients', id: '1' })
    )
  })

  // ─── Growth Tools integration ─────────────────────────────

  it('calls Growth Tools negative-sweep endpoint with correct params', async () => {
    mockPayload.findByID.mockResolvedValue(mockClient)
    mockPayload.find.mockResolvedValue({ docs: [] })

    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ candidates: [] }),
      })

    const res = await GET(makeRequest({ clientId: '1', force: 'true' }))
    const json = await res.json()

    expect(json.ok).toBe(true)

    // Check Growth Tools was called correctly
    expect(mockFetch).toHaveBeenCalledWith(
      'https://growth-tools.test/api/google-ads/negative-sweep',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-api-key': 'test-key',
        }),
      })
    )

    // Check request body
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(callBody.customerId).toBe('9554935739') // dashes removed
    expect(callBody.minSpend).toBe(5)
    expect(callBody.minClicks).toBe(3)
    expect(callBody.maxCandidates).toBe(50)
  })

  it('handles Growth Tools error gracefully', async () => {
    mockPayload.findByID.mockResolvedValue(mockClient)
    mockPayload.find.mockResolvedValue({ docs: [] })

    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    })

    const res = await GET(makeRequest({ clientId: '1', force: 'true' }))
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(json.summary[0].error).toContain('Growth Tools returned 500')
  })

  // ─── AI classification ────────────────────────────────────

  it('creates candidates with AI-suggested negatives', async () => {
    mockPayload.findByID.mockResolvedValue(mockClient)
    mockPayload.find.mockResolvedValue({ docs: [] })

    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ candidates: growthToolsCandidates }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: JSON.stringify(kimiClassification) } }],
        }),
      })

    const res = await GET(makeRequest({ clientId: '1', force: 'true' }))
    const json = await res.json()

    expect(json.ok).toBe(true)
    // AI classified 2 as candidates, 1 as legitimate
    expect(json.summary[0].candidatesCreated).toBe(2)

    // Check the created records
    expect(mockPayload.create).toHaveBeenCalledTimes(2)

    // First candidate: "plumber salary" → suggested "salary" phrase
    const firstCall = mockPayload.create.mock.calls[0][0]
    expect(firstCall.data.searchTerm).toBe('plumber salary')
    expect(firstCall.data.suggestedNegative).toBe('salary')
    expect(firstCall.data.matchType).toBe('phrase')
    expect(firstCall.data.aiReasoning).toContain('Job seeker')

    // Second candidate: "how to fix tap diy" → suggested "diy" phrase
    const secondCall = mockPayload.create.mock.calls[1][0]
    expect(secondCall.data.searchTerm).toBe('how to fix tap diy')
    expect(secondCall.data.suggestedNegative).toBe('diy')
    expect(secondCall.data.matchType).toBe('phrase')
  })

  it('falls back to raw terms when KIMI_API_KEY is missing', async () => {
    delete process.env.KIMI_API_KEY
    mockPayload.findByID.mockResolvedValue(mockClient)
    mockPayload.find.mockResolvedValue({ docs: [] })

    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ candidates: growthToolsCandidates }),
    })

    const res = await GET(makeRequest({ clientId: '1', force: 'true' }))
    const json = await res.json()

    expect(json.ok).toBe(true)
    // All 3 candidates flagged (no AI filtering)
    expect(json.summary[0].candidatesCreated).toBe(3)

    // Fallback uses the raw search term as suggestedNegative
    const firstCall = mockPayload.create.mock.calls[0][0]
    expect(firstCall.data.suggestedNegative).toBe('plumber salary')
    expect(firstCall.data.aiReasoning).toContain('AI classification unavailable')
  })

  it('falls back when Kimi returns invalid JSON', async () => {
    mockPayload.findByID.mockResolvedValue(mockClient)
    mockPayload.find.mockResolvedValue({ docs: [] })

    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ candidates: growthToolsCandidates }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'This is not JSON at all' } }],
        }),
      })

    const res = await GET(makeRequest({ clientId: '1', force: 'true' }))
    const json = await res.json()

    expect(json.ok).toBe(true)
    // Fallback: all flagged as candidates
    expect(json.summary[0].candidatesCreated).toBe(3)
  })

  // ─── Filtering ────────────────────────────────────────────

  it('filters out brand keywords from candidates', async () => {
    const clientWithBrand = {
      ...mockClient,
      brandKeywords: 'plumber near me',
    }
    mockPayload.findByID.mockResolvedValue(clientWithBrand)
    mockPayload.find.mockResolvedValue({ docs: [] })

    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ candidates: growthToolsCandidates }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: JSON.stringify(kimiClassification) } }],
        }),
      })

    const res = await GET(makeRequest({ clientId: '1', force: 'true' }))
    const json = await res.json()

    expect(json.ok).toBe(true)
    // "plumber near me" should be filtered out by brand keyword check
    // Only 2 candidates sent to AI, AI marks 2 as candidates
    expect(json.summary[0].candidatesCreated).toBe(2)
  })

  it('filters out manual exclude terms', async () => {
    const clientWithExcludes = {
      ...mockClient,
      gadsAuto: {
        ...mockClient.gadsAuto,
        negativeSweepExcludeTerms: 'salary\ndiy',
      },
    }
    mockPayload.findByID.mockResolvedValue(clientWithExcludes)
    mockPayload.find.mockResolvedValue({ docs: [] })

    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ candidates: growthToolsCandidates }),
    })

    // Only "plumber near me" should remain after filtering
    // Since KIMI_API_KEY is set, Kimi will be called but with only 1 term
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: JSON.stringify([{
              searchTerm: 'plumber near me',
              isCandidate: false,
              suggestedNegative: '',
              matchType: 'exact',
              suggestedList: '',
              reasoning: 'Relevant high-intent search',
            }]),
          },
        }],
      }),
    })

    const res = await GET(makeRequest({ clientId: '1', force: 'true' }))
    const json = await res.json()

    expect(json.ok).toBe(true)
    // AI said "plumber near me" is not a candidate
    expect(json.summary[0].candidatesCreated).toBe(0)
  })

  // ─── Deduplication ────────────────────────────────────────

  it('skips if candidates already exist for this sweep date', async () => {
    mockPayload.findByID.mockResolvedValue(mockClient)
    // First find: existing candidates exist
    mockPayload.find.mockResolvedValueOnce({ docs: [{ id: '99' }] })

    const res = await GET(makeRequest({ clientId: '1', force: 'true' }))
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(json.summary[0].candidatesCreated).toBe(0)
    // Should NOT have called Growth Tools
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('filters out terms already in the Google Sheet', async () => {
    mockPayload.findByID.mockResolvedValue(mockClient)
    mockPayload.find.mockResolvedValue({ docs: [] })

    // Mock sheets service to return existing keywords
    const { readExistingKeywords } = await import('@/lib/sheets-service')
    const mockReadKeywords = readExistingKeywords as ReturnType<typeof vi.fn>
    mockReadKeywords
      .mockResolvedValueOnce(['plumber salary']) // General list
      .mockResolvedValueOnce([]) // Competitors list

    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ candidates: growthToolsCandidates }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify([
                { searchTerm: 'how to fix tap diy', isCandidate: true, suggestedNegative: 'diy', matchType: 'phrase', suggestedList: 'General', reasoning: 'DIY intent' },
                { searchTerm: 'plumber near me', isCandidate: false, suggestedNegative: '', matchType: 'exact', suggestedList: '', reasoning: 'Relevant' },
              ]),
            },
          }],
        }),
      })

    const res = await GET(makeRequest({ clientId: '1', force: 'true' }))
    const json = await res.json()

    expect(json.ok).toBe(true)
    // "plumber salary" filtered by sheet, "plumber near me" rejected by AI → only "diy" created
    expect(json.summary[0].candidatesCreated).toBe(1)
  })

  // ─── Missing config ───────────────────────────────────────

  it('errors when client has no Google Ads customer ID', async () => {
    const noAdsClient = { ...mockClient, googleAdsCustomerId: null }
    mockPayload.findByID.mockResolvedValue(noAdsClient)
    mockPayload.find.mockResolvedValue({ docs: [] })

    const res = await GET(makeRequest({ clientId: '1', force: 'true' }))
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(json.summary[0].error).toContain('No Google Ads customer ID')
  })

  it('errors when GROWTH_TOOLS_URL is not configured', async () => {
    delete process.env.GROWTH_TOOLS_URL
    mockPayload.findByID.mockResolvedValue(mockClient)
    mockPayload.find.mockResolvedValue({ docs: [] })

    const res = await GET(makeRequest({ clientId: '1', force: 'true' }))
    const json = await res.json()

    expect(json.ok).toBe(true)
    expect(json.summary[0].error).toContain('GROWTH_TOOLS_URL not configured')
  })
})
