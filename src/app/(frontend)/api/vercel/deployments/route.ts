import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { userHasFeature } from '@/lib/access'

const VERCEL_API = 'https://api.vercel.com'

interface VercelProject {
  id: string
  name: string
  framework: string | null
  updatedAt: number
}

interface VercelDeployment {
  uid: string
  name: string
  url: string | null
  created: number
  state: string
  readyState: string
  meta: Record<string, string>
  target: string | null
  creator: { email: string; username: string } | null
  buildingAt: number | null
  ready: number | null
  source: string | null
  inspectorUrl: string | null
  projectId: string
}

async function vercelFetch(path: string, teamId?: string) {
  const token = process.env.VERCEL_API_TOKEN
  if (!token) {
    throw new Error('VERCEL_API_TOKEN not configured')
  }

  const url = new URL(`${VERCEL_API}${path}`)
  if (teamId) {
    url.searchParams.set('teamId', teamId)
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Vercel API ${res.status}: ${text}`)
  }

  return res.json()
}

async function fetchProjects(teamId?: string): Promise<VercelProject[]> {
  const data = await vercelFetch('/v9/projects?limit=100', teamId)
  return (data.projects || []).map((p: VercelProject) => ({
    id: p.id,
    name: p.name,
    framework: p.framework,
    updatedAt: p.updatedAt,
  }))
}

async function fetchDeployments(
  teamId?: string,
  projectId?: string,
  limit = 20,
): Promise<VercelDeployment[]> {
  let path = `/v6/deployments?limit=${limit}`
  if (projectId) path += `&projectId=${projectId}`

  const data = await vercelFetch(path, teamId)
  return (data.deployments || []).map((d: VercelDeployment) => ({
    uid: d.uid,
    name: d.name,
    url: d.url,
    created: d.created,
    state: d.state || d.readyState,
    readyState: d.readyState,
    meta: d.meta || {},
    target: d.target,
    creator: d.creator
      ? { email: d.creator.email, username: d.creator.username }
      : null,
    buildingAt: d.buildingAt,
    ready: d.ready,
    source: d.source,
    inspectorUrl: d.inspectorUrl,
    projectId: d.projectId,
  }))
}

async function fetchBillingCharges(teamId: string, from: string, to: string) {
  const token = process.env.VERCEL_API_TOKEN
  if (!token) throw new Error('VERCEL_API_TOKEN not configured')

  const url = new URL(`${VERCEL_API}/v1/billing/charges`)
  url.searchParams.set('from', from)
  url.searchParams.set('to', to)
  url.searchParams.set('teamId', teamId)

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Vercel billing API ${res.status}: ${text}`)
  }

  // Response is JSONL (newline-delimited JSON)
  const text = await res.text()
  const lines = text.trim().split('\n').filter(Boolean)
  return lines.map((line) => JSON.parse(line))
}

async function fetchBillingHistory(teamId: string, months: number) {
  const now = new Date()
  const results: { month: string; charges: unknown[] }[] = []

  for (let i = 0; i < months; i++) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const monthEnd =
      i === 0
        ? now
        : new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)

    const label = monthStart.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    })

    try {
      const charges = await fetchBillingCharges(
        teamId,
        monthStart.toISOString(),
        monthEnd.toISOString(),
      )
      results.push({ month: label, charges })
    } catch {
      results.push({ month: label, charges: [] })
    }
  }

  return results.reverse()
}

export async function GET(req: NextRequest) {
  // Route handlers are independently reachable — enforce auth here directly
  // rather than relying on the calling server component. Deployment metadata
  // and Vercel billing are admin-only (gated on `nav:deployments`).
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!userHasFeature(user, 'nav:deployments')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!process.env.VERCEL_API_TOKEN) {
    return NextResponse.json(
      { error: 'VERCEL_API_TOKEN not configured' },
      { status: 500 },
    )
  }

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') || 'deployments'
  const teamId = searchParams.get('teamId') || undefined
  const projectId = searchParams.get('projectId') || undefined

  try {
    if (action === 'projects') {
      const projects = await fetchProjects(teamId)
      return NextResponse.json({ projects })
    }

    if (action === 'billing') {
      if (!teamId) {
        return NextResponse.json(
          { error: 'teamId required for billing data' },
          { status: 400 },
        )
      }
      const from = searchParams.get('from') || ''
      const to = searchParams.get('to') || ''
      if (!from || !to) {
        return NextResponse.json(
          { error: 'from and to date params required' },
          { status: 400 },
        )
      }
      const charges = await fetchBillingCharges(teamId, from, to)
      return NextResponse.json({ charges })
    }

    if (action === 'billing-history') {
      if (!teamId) {
        return NextResponse.json(
          { error: 'teamId required for billing history' },
          { status: 400 },
        )
      }
      const months = parseInt(searchParams.get('months') || '6', 10)
      const history = await fetchBillingHistory(teamId, months)
      return NextResponse.json({ history })
    }

    // Default: deployments
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const deployments = await fetchDeployments(teamId, projectId, limit)
    return NextResponse.json({ deployments })
  } catch (err) {
    // Don't leak verbatim upstream Vercel error bodies (may include tokens,
    // internal IDs, billing details). Log server-side, return generic message.
    console.error('[vercel-deployments]', err)
    return NextResponse.json({ error: 'Upstream error' }, { status: 500 })
  }
}
