import { getPayload } from 'payload'
import config from '@/payload.config'
import { NextResponse } from 'next/server'

export async function GET() {
  const results: Record<string, string> = {}

  try {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })

    // Test 1: Fetch current user (id=1)
    try {
      const user = await payload.findByID({
        collection: 'users',
        id: 1,
        overrideAccess: true,
      })
      results['user_fetch'] = `OK - ${user.email} (${user.role})`
    } catch (e: any) {
      results['user_fetch'] = `FAIL - ${e.message}`
    }

    // Test 2: Fetch client (id=1)
    try {
      const client = await payload.findByID({
        collection: 'clients',
        id: 1,
        overrideAccess: true,
        depth: 2,
      })
      results['client_fetch'] = `OK - ${client.name}`
      results['client_fields'] = JSON.stringify(Object.keys(client))
    } catch (e: any) {
      results['client_fetch'] = `FAIL - ${e.message}`
    }

    // Test 3: List client-proposals
    try {
      const proposals = await payload.find({
        collection: 'client-proposals',
        limit: 1,
        overrideAccess: true,
      })
      results['proposals_list'] = `OK - ${proposals.totalDocs} total`
    } catch (e: any) {
      results['proposals_list'] = `FAIL - ${e.message}`
    }

    // Test 4: List competitor-analyses
    try {
      const comp = await payload.find({
        collection: 'competitor-analyses',
        limit: 1,
        overrideAccess: true,
      })
      results['competitor_list'] = `OK - ${comp.totalDocs} total`
    } catch (e: any) {
      results['competitor_list'] = `FAIL - ${e.message}`
    }

    // Test 5: Check users collection fields config
    try {
      const usersConfig = payload.collections['users'].config
      results['users_fields'] = usersConfig.fields.map((f: any) => f.name || f.type).join(', ')
    } catch (e: any) {
      results['users_config'] = `FAIL - ${e.message}`
    }

    // Test 6: Check if user has sessions table
    try {
      const db = payload.db
      results['db_adapter'] = db?.name || 'unknown'
    } catch (e: any) {
      results['db_info'] = `FAIL - ${e.message}`
    }

  } catch (e: any) {
    results['payload_init'] = `FAIL - ${e.message}\n${e.stack}`
  }

  return NextResponse.json(results, { status: 200 })
}
