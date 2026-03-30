'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { SetStepNav } from '@payloadcms/ui'

// ── Types ──

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

interface BillingCharge {
  BilledCost: number
  ServiceName: string
  ChargePeriodStart?: string
  ChargePeriodEnd?: string
  Tags?: { ProjectName?: string; ProjectId?: string }
  [key: string]: unknown
}

interface DayCost {
  day: string // YYYY-MM-DD
  label: string // "Mar 1", "Mar 2", etc.
  cost: number
}

interface ProjectDeployStatus {
  projectId: string
  projectName: string
  lastDeploy: VercelDeployment | null
}

interface MonthlyHistory {
  month: string
  charges: BillingCharge[]
}

interface MonthProjectCost {
  month: string
  costs: Record<string, number>
  total: number
}

type CostPeriod = 'total' | 'this-month' | 'last-month'

// ── Helpers ──

function normalizeProjectName(name: string): string {
  return name.replace(/-\d{10,}-[A-Za-z0-9]{4}$/, '')
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function stateColor(state: string): string {
  switch (state) {
    case 'READY':
      return '#50e3c2'
    case 'BUILDING':
    case 'INITIALIZING':
      return '#f5a623'
    case 'ERROR':
    case 'CANCELED':
      return '#e00'
    case 'QUEUED':
      return '#888'
    default:
      return '#999'
  }
}

function stateBadge(state: string): string {
  switch (state) {
    case 'READY':
      return '✓'
    case 'BUILDING':
    case 'INITIALIZING':
      return '⏳'
    case 'ERROR':
      return '✕'
    case 'CANCELED':
      return '⊘'
    case 'QUEUED':
      return '◷'
    default:
      return '•'
  }
}

function aggregateCharges(charges: BillingCharge[]): { name: string; cost: number }[] {
  const map = new Map<string, number>()
  for (const charge of charges) {
    const raw = charge.Tags?.ProjectName || 'Platform / Shared'
    const name = normalizeProjectName(raw)
    map.set(name, (map.get(name) || 0) + (charge.BilledCost || 0))
  }
  return Array.from(map.entries())
    .map(([name, cost]) => ({ name, cost }))
    .filter((p) => p.cost > 0)
    .sort((a, b) => b.cost - a.cost)
}

const PROJECT_COLORS = [
  '#7b61ff', '#50e3c2', '#f5a623', '#e05580', '#4ecdc4', '#ff6b6b',
  '#a8e6cf', '#ffd93d', '#6c5ce7', '#fd79a8', '#00b894', '#e17055',
  '#0984e3', '#d63031', '#00cec9', '#fdcb6e',
]

// ── Stacked Bar Chart ──

function StackedBarChart({
  data,
  projectNames,
}: {
  data: MonthProjectCost[]
  projectNames: string[]
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<{
    x: number
    y: number
    content: string
  } | null>(null)

  if (!data.length) return null

  const width = 800
  const height = 320
  const padding = { top: 20, right: 20, bottom: 60, left: 60 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const maxTotal = Math.max(...data.map((d) => d.total), 1)
  const barWidth = Math.min(60, (chartW / data.length) * 0.7)
  const barGap = (chartW - barWidth * data.length) / (data.length + 1)

  const yTicks: number[] = []
  const tickStep = Math.ceil(maxTotal / 5 / 5) * 5
  for (let t = 0; t <= maxTotal + tickStep; t += tickStep) {
    yTicks.push(t)
  }

  const colorMap = new Map<string, string>()
  projectNames.forEach((name, i) => {
    colorMap.set(name, PROJECT_COLORS[i % PROJECT_COLORS.length])
  })

  return (
    <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', maxWidth: width, height: 'auto' }}
      >
        {yTicks.map((tick) => {
          const y = padding.top + chartH - (tick / (maxTotal + tickStep)) * chartH
          return (
            <g key={tick}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#2a2a3e" strokeWidth={1} />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fill="#666" fontSize={11}>${tick}</text>
            </g>
          )
        })}
        {data.map((monthData, i) => {
          const x = padding.left + barGap + i * (barWidth + barGap)
          let yOffset = 0
          return (
            <g key={monthData.month}>
              {projectNames.map((projName) => {
                const cost = monthData.costs[projName] || 0
                if (cost <= 0) return null
                const barH = (cost / (maxTotal + tickStep)) * chartH
                const y = padding.top + chartH - yOffset - barH
                yOffset += barH
                return (
                  <rect
                    key={projName}
                    x={x} y={y} width={barWidth} height={barH}
                    fill={colorMap.get(projName) || '#666'} rx={2}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => {
                      const rect = svgRef.current?.getBoundingClientRect()
                      if (rect) {
                        setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10, content: `${projName}: $${cost.toFixed(2)}` })
                      }
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                )
              })}
              {monthData.total > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={padding.top + chartH - (monthData.total / (maxTotal + tickStep)) * chartH - 6}
                  textAnchor="middle" fill="#aaa" fontSize={11} fontWeight={600}
                >${monthData.total.toFixed(0)}</text>
              )}
              <text x={x + barWidth / 2} y={height - padding.bottom + 20} textAnchor="middle" fill="#888" fontSize={11}>
                {monthData.month}
              </text>
            </g>
          )
        })}
      </svg>
      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x, top: tooltip.y,
          transform: 'translate(-50%, -100%)', background: '#111',
          border: '1px solid #444', borderRadius: 6, padding: '6px 10px',
          fontSize: 12, color: '#fff', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10,
        }}>
          {tooltip.content}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 12, paddingLeft: padding.left }}>
        {projectNames.map((name) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#aaa' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: colorMap.get(name) || '#666', flexShrink: 0 }} />
            {name}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Daily Cost Bar ──

function DailyCostBar({ charges, monthLabel }: { charges: BillingCharge[]; monthLabel: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; content: string } | null>(null)

  // Group charges by day
  const dailyCosts: DayCost[] = (() => {
    const map = new Map<string, number>()
    for (const charge of charges) {
      const cost = charge.BilledCost || 0
      if (cost <= 0) continue
      const start = charge.ChargePeriodStart
      if (!start) continue
      const day = start.slice(0, 10) // YYYY-MM-DD
      map.set(day, (map.get(day) || 0) + cost)
    }
    // Build array for all days in the month (up to today)
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const todayDate = now.getDate()
    const result: DayCost[] = []
    for (let d = 1; d <= Math.min(daysInMonth, todayDate); d++) {
      const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const label = new Date(year, month, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      result.push({ day: dayStr, label, cost: map.get(dayStr) || 0 })
    }
    return result
  })()

  if (dailyCosts.length === 0) return null

  const maxDayCost = Math.max(...dailyCosts.map((d) => d.cost), 0.01)
  const totalCost = dailyCosts.reduce((s, d) => s + d.cost, 0)

  // Color gradient from low (dim) to high (bright)
  function dayColor(cost: number): string {
    if (cost <= 0) return '#1a1a2e'
    const intensity = Math.min(cost / maxDayCost, 1)
    if (intensity < 0.25) return '#1a3a2e'
    if (intensity < 0.5) return '#2a6a4e'
    if (intensity < 0.75) return '#f5a623'
    return '#e05580'
  }

  return (
    <div
      ref={containerRef}
      style={{
        background: '#1a1a2e',
        border: '1px solid #2a2a3e',
        borderRadius: 8,
        padding: '16px 20px',
        marginBottom: 32,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
            Daily Costs — {monthLabel}
          </span>
          <span style={{ fontSize: 12, color: '#888', marginLeft: 12 }}>
            Total: <span style={{ color: '#50e3c2', fontWeight: 600, fontFamily: 'monospace' }}>${totalCost.toFixed(2)}</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: '#666' }}>
          <span>Low</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {['#1a3a2e', '#2a6a4e', '#f5a623', '#e05580'].map((c) => (
              <div key={c} style={{ width: 12, height: 8, borderRadius: 2, background: c }} />
            ))}
          </div>
          <span>High</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 32, position: 'relative' }}>
        {dailyCosts.map((dc) => (
          <div
            key={dc.day}
            style={{
              flex: 1,
              height: dc.cost > 0 ? Math.max(4, (dc.cost / maxDayCost) * 32) : 4,
              background: dayColor(dc.cost),
              borderRadius: 2,
              cursor: 'pointer',
              transition: 'opacity 0.15s',
              minWidth: 4,
            }}
            onMouseEnter={(e) => {
              const rect = containerRef.current?.getBoundingClientRect()
              if (rect) {
                setTooltip({ x: e.clientX - rect.left, content: `${dc.label}: $${dc.cost.toFixed(2)}` })
              }
            }}
            onMouseMove={(e) => {
              const rect = containerRef.current?.getBoundingClientRect()
              if (rect) {
                setTooltip({ x: e.clientX - rect.left, content: `${dc.label}: $${dc.cost.toFixed(2)}` })
              }
            }}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}
      </div>
      {/* Day labels — show 1st, ~10th, ~20th, last */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        {dailyCosts.filter((_, i) => i === 0 || i === Math.floor(dailyCosts.length / 3) || i === Math.floor((dailyCosts.length * 2) / 3) || i === dailyCosts.length - 1).map((dc) => (
          <span key={dc.day} style={{ fontSize: 10, color: '#555' }}>{dc.label}</span>
        ))}
      </div>
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x,
            top: 8,
            transform: 'translateX(-50%)',
            background: '#111',
            border: '1px solid #444',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 12,
            color: '#fff',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  )
}

// ── Section Header ──

function SectionHeader({
  title,
  right,
  collapsed,
  onToggle,
  borderBottom = true,
}: {
  title: string
  right?: React.ReactNode
  collapsed?: boolean
  onToggle?: () => void
  borderBottom?: boolean
}) {
  return (
    <div
      style={{
        padding: '16px 20px',
        borderBottom: borderBottom ? '1px solid #2a2a3e' : 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: onToggle ? 'pointer' : 'default',
        userSelect: 'none',
      }}
      onClick={onToggle}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {onToggle && (
          <span style={{ fontSize: 12, color: '#888', transition: 'transform 0.2s', display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
            ▼
          </span>
        )}
        <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
          {title}
        </span>
      </div>
      {right && <div onClick={(e) => e.stopPropagation()}>{right}</div>}
    </div>
  )
}

// ── Period Toggle ──

function PeriodToggle({
  value,
  onChange,
}: {
  value: CostPeriod
  onChange: (v: CostPeriod) => void
}) {
  const options: { label: string; value: CostPeriod }[] = [
    { label: 'Total', value: 'total' },
    { label: 'This Month', value: 'this-month' },
    { label: 'Last Month', value: 'last-month' },
  ]
  return (
    <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: '1px solid #333' }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            background: value === opt.value ? '#7b61ff' : '#1a1a2e',
            border: 'none',
            padding: '5px 12px',
            color: value === opt.value ? '#fff' : '#888',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            borderRight: opt.value !== 'last-month' ? '1px solid #333' : 'none',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Main Component ──

const DeploymentDashboard = () => {
  const [projects, setProjects] = useState<VercelProject[]>([])
  const [deployments, setDeployments] = useState<VercelDeployment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const teamId = 'peters-projects-589d7e29'
  const [billingCharges, setBillingCharges] = useState<BillingCharge[]>([])
  const [lastMonthCharges, setLastMonthCharges] = useState<BillingCharge[]>([])
  const [billingLoading, setBillingLoading] = useState(false)
  const [billingError, setBillingError] = useState<string | null>(null)

  const [billingHistory, setBillingHistory] = useState<MonthlyHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // UI state
  const [costsCollapsed, setCostsCollapsed] = useState(true)
  const [costPeriod, setCostPeriod] = useState<CostPeriod>('total')

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch(`/api/vercel/deployments?action=projects&teamId=${encodeURIComponent(teamId)}`)
      if (!res.ok) throw new Error(`Failed to fetch projects: ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setProjects(data.projects || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch projects')
    }
  }, [])

  const fetchDeployments = useCallback(async () => {
    try {
      const res = await fetch(`/api/vercel/deployments?action=deployments&limit=100&teamId=${encodeURIComponent(teamId)}`)
      if (!res.ok) throw new Error(`Failed to fetch deployments: ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setDeployments(data.deployments || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch deployments')
    }
  }, [])

  const fetchBilling = useCallback(async () => {
    setBillingLoading(true)
    setBillingError(null)
    try {
      const now = new Date()

      // This month
      const thisMonthFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const thisMonthTo = now.toISOString()
      const thisRes = await fetch(
        `/api/vercel/deployments?action=billing&teamId=${encodeURIComponent(teamId)}&from=${encodeURIComponent(thisMonthFrom)}&to=${encodeURIComponent(thisMonthTo)}`,
      )
      if (!thisRes.ok) throw new Error(`Failed to fetch billing: ${thisRes.status}`)
      const thisData = await thisRes.json()
      if (thisData.error) throw new Error(thisData.error)
      setBillingCharges(thisData.charges || [])

      // Last month
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
      const lastRes = await fetch(
        `/api/vercel/deployments?action=billing&teamId=${encodeURIComponent(teamId)}&from=${encodeURIComponent(lastMonthStart.toISOString())}&to=${encodeURIComponent(lastMonthEnd.toISOString())}`,
      )
      if (!lastRes.ok) throw new Error(`Failed to fetch last month billing: ${lastRes.status}`)
      const lastData = await lastRes.json()
      if (lastData.error) throw new Error(lastData.error)
      setLastMonthCharges(lastData.charges || [])
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : 'Failed to fetch billing')
    } finally {
      setBillingLoading(false)
    }
  }, [])

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/vercel/deployments?action=billing-history&teamId=${encodeURIComponent(teamId)}&months=6`)
      if (!res.ok) throw new Error(`Failed to fetch history: ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setBillingHistory(data.history || [])
    } catch {
      // Silently fail — history is supplementary
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await Promise.all([fetchProjects(), fetchDeployments(), fetchBilling(), fetchHistory()])
      setLoading(false)
    }
    init()
  }, [fetchProjects, fetchDeployments, fetchBilling, fetchHistory])

  // ── Derived data ──

  // Per-project last deployment status — only projects WITH deploys
  const projectStatuses: ProjectDeployStatus[] = projects
    .map((p) => {
      const projectDeploys = deployments
        .filter((d) => d.projectId === p.id && d.target === 'production')
        .sort((a, b) => b.created - a.created)
      return {
        projectId: p.id,
        projectName: p.name,
        lastDeploy: projectDeploys[0] || null,
      }
    })
    .filter((ps) => ps.lastDeploy !== null)
    .sort((a, b) => {
      const aTime = a.lastDeploy?.created || 0
      const bTime = b.lastDeploy?.created || 0
      return bTime - aTime
    })

  // Cost data by period
  const thisMonthCosts = aggregateCharges(billingCharges)
  const lastMonthCosts = aggregateCharges(lastMonthCharges)
  const totalCosts = aggregateCharges([...billingCharges, ...lastMonthCharges])

  const activeCosts = costPeriod === 'this-month' ? thisMonthCosts : costPeriod === 'last-month' ? lastMonthCosts : totalCosts
  const activeCostTotal = activeCosts.reduce((sum, p) => sum + p.cost, 0)

  const periodLabel = costPeriod === 'this-month'
    ? new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : costPeriod === 'last-month'
      ? new Date(new Date().getFullYear(), new Date().getMonth() - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : 'All Time (This + Last Month)'

  // Monthly history by project for stacked bar chart
  const allProjectNames = new Set<string>()
  const monthlyProjectCosts: MonthProjectCost[] = billingHistory.map((mh) => {
    const costs: Record<string, number> = {}
    let total = 0
    for (const charge of mh.charges as BillingCharge[]) {
      const raw = charge.Tags?.ProjectName || 'Platform / Shared'
      const name = normalizeProjectName(raw)
      costs[name] = (costs[name] || 0) + (charge.BilledCost || 0)
      total += charge.BilledCost || 0
      if ((charge.BilledCost || 0) > 0) allProjectNames.add(name)
    }
    return { month: mh.month, costs, total }
  })
  const sortedProjectNames = Array.from(allProjectNames).sort()

  if (loading) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: '#888' }}>
        Loading deployment data...
      </div>
    )
  }

  if (error && !deployments.length && !projects.length) {
    return (
      <div style={{ padding: '40px 0' }}>
        <div style={{ background: '#2a1515', border: '1px solid #e00', borderRadius: 8, padding: '20px 24px', color: '#f88' }}>
          <strong>Error:</strong> {error}
          <div style={{ marginTop: 12, color: '#999', fontSize: 13 }}>
            Make sure <code>VERCEL_API_TOKEN</code> is set in your environment variables.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* Breadcrumbs */}
      <SetStepNav nav={[{ label: 'Settings' }, { label: 'Deployments' }]} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#fff' }}>Deployments</h1>
        <button
          onClick={() => { fetchProjects(); fetchDeployments(); fetchBilling() }}
          style={{ background: '#333', border: '1px solid #555', borderRadius: 6, padding: '8px 16px', color: '#fff', fontSize: 13, cursor: 'pointer' }}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ background: '#2a1515', border: '1px solid #e00', borderRadius: 8, padding: '12px 16px', color: '#f88', marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── Section 1: Project Deploy Status ── */}
      <div style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 8, overflow: 'hidden', marginBottom: 32 }}>
        <SectionHeader title="Project Status" />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2a2a3e', color: '#888', textAlign: 'left' }}>
                <th style={{ padding: '10px 16px', fontWeight: 500 }}>Project</th>
                <th style={{ padding: '10px 16px', fontWeight: 500 }}>Status</th>
                <th style={{ padding: '10px 16px', fontWeight: 500 }}>Last Deploy</th>
                <th style={{ padding: '10px 16px', fontWeight: 500 }}>Branch</th>
                <th style={{ padding: '10px 16px', fontWeight: 500 }}>Commit</th>
              </tr>
            </thead>
            <tbody>
              {projectStatuses.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: '#666' }}>
                    No deployed projects found
                  </td>
                </tr>
              ) : (
                projectStatuses.map((ps) => {
                  const d = ps.lastDeploy!
                  const state = d.readyState || d.state
                  const branch = d.meta?.githubCommitRef || d.meta?.gitlabCommitRef || '—'
                  const commitMsg = d.meta?.githubCommitMessage || d.meta?.gitlabCommitMessage || ''
                  const truncatedMsg = commitMsg.length > 60 ? commitMsg.slice(0, 60) + '...' : commitMsg

                  return (
                    <tr
                      key={ps.projectId}
                      style={{ borderBottom: '1px solid #2a2a3e', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#22223a')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                        {d.inspectorUrl ? (
                          <a href={d.inspectorUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#7b61ff', textDecoration: 'none' }}>
                            {ps.projectName}
                          </a>
                        ) : ps.projectName}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: stateColor(state), fontSize: 12, fontWeight: 600 }}>
                          <span style={{ fontSize: 14 }}>{stateBadge(state)}</span>
                          {state}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#aaa', fontSize: 12 }} title={new Date(d.created).toLocaleString()}>
                        {formatRelativeTime(d.created)}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#aaa', fontSize: 12, fontFamily: 'monospace' }}>
                        {branch}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#aaa', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={commitMsg}>
                        {truncatedMsg || '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Daily Cost Bar ── */}
      {billingCharges.length > 0 && (
        <DailyCostBar
          charges={billingCharges}
          monthLabel={new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        />
      )}

      {/* ── Section 2: Monthly Cost History (Stacked Bar Chart) ── */}
      <div style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 8, padding: '20px 24px', marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: '#fff' }}>
              Monthly Cost History
            </div>
            <div style={{ fontSize: 12, color: '#888' }}>
              Last 6 months — cost per project
            </div>
          </div>
          {historyLoading && (
            <span style={{ fontSize: 12, color: '#888' }}>Loading history...</span>
          )}
        </div>

        {monthlyProjectCosts.length > 0 && monthlyProjectCosts.some((m) => m.total > 0) ? (
          <StackedBarChart data={monthlyProjectCosts} projectNames={sortedProjectNames} />
        ) : (
          !historyLoading && (
            <div style={{ color: '#666', fontSize: 13, padding: '20px 0' }}>
              No historical billing data available.
            </div>
          )
        )}
      </div>

      {/* ── Section 3: Costs by Project (collapsible, with period toggle) ── */}
      <div style={{ background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 8, overflow: 'hidden' }}>
        <SectionHeader
          title="Month-to-Date Costs"
          collapsed={costsCollapsed}
          onToggle={() => setCostsCollapsed((v) => !v)}
          borderBottom={!costsCollapsed}
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <PeriodToggle value={costPeriod} onChange={setCostPeriod} />
              {!costsCollapsed && billingLoading && (
                <span style={{ fontSize: 12, color: '#888' }}>Loading...</span>
              )}
            </div>
          }
        />

        {/* Collapsed summary — always visible */}
        {costsCollapsed && (
          <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#888' }}>{periodLabel}:</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#50e3c2', fontFamily: 'monospace' }}>
              ${activeCostTotal.toFixed(2)}
            </span>
          </div>
        )}

        {/* Expanded table */}
        {!costsCollapsed && (
          <>
            {billingError && (
              <div style={{ padding: '12px 20px', color: '#f88', fontSize: 13, background: '#2a1515' }}>
                {billingError}
              </div>
            )}

            {activeCosts.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #2a2a3e', color: '#888', textAlign: 'left' }}>
                    <th style={{ padding: '10px 16px', fontWeight: 500 }}>Project</th>
                    <th style={{ padding: '10px 16px', fontWeight: 500, textAlign: 'right' }}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {activeCosts.map((p) => (
                    <tr key={p.name} style={{ borderBottom: '1px solid #2a2a3e' }}>
                      <td style={{ padding: '10px 16px', color: '#ccc' }}>{p.name}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, color: '#fff' }}>
                        ${p.cost.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #3a3a5e', background: '#16162a' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#fff' }}>Total</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, fontSize: 16, color: '#50e3c2' }}>
                      ${activeCostTotal.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              !billingLoading && !billingError && (
                <div style={{ padding: '24px 20px', color: '#666', fontSize: 13 }}>
                  No billing charges found for this period.
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default DeploymentDashboard
