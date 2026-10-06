import { beforeEach, describe, expect, it, vi } from 'vitest'

const payload = { auth: vi.fn(), find: vi.fn(), create: vi.fn() }
vi.mock('payload', () => ({
  getPayload: vi.fn(async () => payload),
  createLocalReq: vi.fn(async ({ user }: { user: unknown }) => ({ user })),
}))
vi.mock('@/payload.config', () => ({ default: Promise.resolve({}) }))

const staged = {
  businessName: 'Aussie Fluid Power',
  slug: 'aussie-fluid-power',
  websiteUrl: 'https://www.aussiefluidpower.com.au',
  contactName: 'Priya',
  contactEmail: 'priya@aussiefluidpower.com.au',
  businessType: 'trades',
  conversionGoal: 'quote requests',
  businessGoals: 'More hydraulic service work',
  notes: 'Referred by AMP',
}
const request = (body: unknown = staged) =>
  new Request('http://localhost/api/optimate/adminmate/create-proposal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('AdminMate create-proposal route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    payload.auth.mockResolvedValue({ user: { id: 7, role: 'admin' } })
    payload.find.mockResolvedValue({ totalDocs: 0, docs: [] })
    payload.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 21,
      ...data,
    }))
  })

  it('denies unauthenticated and non-admin users', async () => {
    const { POST } = await import('@/app/(frontend)/api/optimate/adminmate/create-proposal/route')
    payload.auth.mockResolvedValueOnce({ user: null })
    expect((await POST(request())).status).toBe(401)
    payload.auth.mockResolvedValueOnce({ user: { id: 2, role: 'staff' } })
    expect((await POST(request())).status).toBe(403)
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('rejects an invalid staged proposal before writing', async () => {
    const { POST } = await import('@/app/(frontend)/api/optimate/adminmate/create-proposal/route')
    expect((await POST(request({ slug: 'acme' }))).status).toBe(400)
    expect((await POST(request({ ...staged, businessType: 'hacking' }))).status).toBe(400)
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('reports a slug conflict instead of creating a duplicate', async () => {
    const { POST } = await import('@/app/(frontend)/api/optimate/adminmate/create-proposal/route')
    payload.find.mockResolvedValueOnce({
      totalDocs: 1,
      docs: [{ businessName: 'Aussie Fluid Power' }],
    })
    const response = await POST(request())
    expect(response.status).toBe(409)
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('creates the proposal with only allowlisted fields', async () => {
    const { POST } = await import('@/app/(frontend)/api/optimate/adminmate/create-proposal/route')
    const response = await POST(
      request({
        ...staged,
        proposalPin: '1234',
        googleAdsCustomerId: '123-456-7890',
        auditStatus: 'running',
      }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      id: 21,
      businessName: 'Aussie Fluid Power',
      slug: 'aussie-fluid-power',
      adminUrl: '/admin/collections/client-proposals/21',
    })
    const data = payload.create.mock.calls[0][0].data as Record<string, unknown>
    expect(data).toMatchObject({
      businessName: 'Aussie Fluid Power',
      slug: 'aussie-fluid-power',
      websiteUrl: 'https://www.aussiefluidpower.com.au',
      contactName: 'Priya',
      contactEmail: 'priya@aussiefluidpower.com.au',
      businessType: 'trades',
      conversionGoal: 'quote requests',
    })
    expect(data.proposalPin).toBeUndefined()
    expect(data.googleAdsCustomerId).toBeUndefined()
    expect(data.auditStatus).toBeUndefined()
  })
})
