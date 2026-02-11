import { getPayload } from 'payload'
import config from '@/payload.config'
import { NextResponse } from 'next/server'

export async function GET() {
  const results: Record<string, string> = {}

  try {
    const payloadConfig = await config
    const payload = await getPayload({ config: payloadConfig })

    // Test 1: Fetch user with depth (like account page does)
    try {
      const user = await payload.findByID({
        collection: 'users',
        id: 1,
        overrideAccess: true,
        depth: 2,
      })
      results['user_fetch_deep'] = `OK - ${JSON.stringify(user).length} chars`
      results['user_sessions'] = JSON.stringify(user.sessions ?? 'no sessions field')
    } catch (e: any) {
      results['user_fetch_deep'] = `FAIL - ${e.message}\n${e.stack?.slice(0, 500)}`
    }

    // Test 2: Fetch client with full depth (like edit page does)
    try {
      const client = await payload.findByID({
        collection: 'clients',
        id: 1,
        overrideAccess: true,
        depth: 2,
      })
      results['client_fetch_deep'] = `OK - ${JSON.stringify(client).length} chars`
      // Check for any field that might cause serialization issues
      for (const [key, val] of Object.entries(client)) {
        if (val !== null && val !== undefined && typeof val === 'object') {
          try {
            JSON.stringify(val)
          } catch {
            results[`client_bad_field_${key}`] = 'FAIL - not serializable'
          }
        }
      }
    } catch (e: any) {
      results['client_fetch_deep'] = `FAIL - ${e.message}\n${e.stack?.slice(0, 500)}`
    }

    // Test 3: Run raw SQL to check for schema issues
    try {
      const tablesResult = await (payload.db as any).drizzle.run({
        sql: "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        args: [],
      })
      results['raw_tables'] = JSON.stringify(tablesResult?.rows?.map((r: any) => r.name ?? r[0]) ?? 'unknown format')
    } catch (e: any) {
      // Try alternative method
      try {
        const client = (payload.db as any).client
        if (client?.execute) {
          const res = await client.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
          results['raw_tables'] = JSON.stringify(res.rows?.map((r: any) => r.name) ?? 'unknown')
        } else {
          results['raw_tables'] = `no execute method - db keys: ${Object.keys(payload.db).join(', ')}`
        }
      } catch (e2: any) {
        results['raw_tables'] = `FAIL both methods - ${e.message} / ${e2.message}`
      }
    }

    // Test 4: Simulate what the admin account page does
    try {
      // The account page fetches the user and renders a form
      // Check if Payload can build the admin config for the account page
      const adminConfig = payloadConfig.admin
      results['admin_user_slug'] = typeof adminConfig?.user === 'string' ? adminConfig.user : 'object'
      results['admin_components'] = JSON.stringify(Object.keys(adminConfig?.components ?? {}))
    } catch (e: any) {
      results['admin_config'] = `FAIL - ${e.message}`
    }

  } catch (e: any) {
    results['payload_init'] = `FAIL - ${e.message}\n${e.stack?.slice(0, 1000)}`
  }

  return NextResponse.json(results, { status: 200 })
}
