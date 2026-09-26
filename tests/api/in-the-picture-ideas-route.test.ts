import { afterEach, describe, expect, it } from 'vitest'
import { POST } from '@/app/(frontend)/api/content-sync/ideas/route'

const original = { ...process.env }
afterEach(() => { process.env = { ...original } })
const token = 't'.repeat(40)
const request = (body: string, authorization?: string) => new Request('https://cms.example.com/api/content-sync/ideas', { method: 'POST', body, headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) } })

describe('idea receiver', () => {
  it('fails closed without a configured client/token', async () => {
    delete process.env.IN_THE_PICTURE_CLIENT_ID
    delete process.env.CONTENT_CMS_IDEAS_TOKEN
    expect((await POST(request('{}'))).status).toBe(503)
  })
  it('rejects missing and wrong bearer credentials before touching the DB', async () => {
    process.env.IN_THE_PICTURE_CLIENT_ID = '1'
    process.env.CONTENT_CMS_IDEAS_TOKEN = token
    expect((await POST(request('{}'))).status).toBe(401)
    expect((await POST(request('{}', `Bearer ${'x'.repeat(40)}`))).status).toBe(401)
  })
  it('bounds request bodies and validates the entire batch', async () => {
    process.env.IN_THE_PICTURE_CLIENT_ID = '1'
    process.env.CONTENT_CMS_IDEAS_TOKEN = token
    expect((await POST(request('x'.repeat(500_001), `Bearer ${token}`))).status).toBe(413)
    expect((await POST(request('{', `Bearer ${token}`))).status).toBe(400)
    expect((await POST(request(JSON.stringify({ version: 1, ideas: [{ blogId: 'not-a-uuid' }] }), `Bearer ${token}`))).status).toBe(400)
  })
})
