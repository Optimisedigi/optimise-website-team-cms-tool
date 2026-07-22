'use client'

import { useEffect, useLayoutEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'

// Clamp a portal tooltip's horizontal centre so it never runs off the left or
// right edge of the viewport (the bug on mobile, where a KPI tile near the
// screen edge pushed the tooltip off-screen). `center` is the desired centre
// x (the tooltip is `transform: translateX(-50%)`), `width` its measured px
// width. Returns the centre x to use.
function clampTooltipCenter(center: number, width: number): number {
  if (typeof window === 'undefined') return center
  const margin = 8
  const vw = window.innerWidth
  // Too wide to fit with margins on both sides — just centre it; CSS caps the
  // width to the viewport.
  if (width >= vw - margin * 2) return vw / 2
  const half = width / 2
  return Math.max(margin + half, Math.min(center, vw - margin - half))
}
import RocketSplash from './RocketSplash'
import SalesFunnelDashboard from './SalesFunnelDashboard'
import DripEmailTracker from './DripEmailTracker'

// ─── Types ────────────────────────────────────────────────

interface GscData {
  totalClicks?: number
  totalImpressions?: number
  avgCtr?: number
  avgPosition?: number
  clicksChange?: number
  impressionsChange?: number
  positionChange?: number
  ctrChange?: number
  uniqueKeywords?: number
  uniquePages?: number
  topKeywords?: { query?: string; clicks?: number; impressions?: number; ctr?: number; position?: number }[]
  periodStart?: string
  periodEnd?: string
  clientId?: string
  gscConnected?: boolean
}

interface GscMonthlyEntry {
  month: string
  clicks: number
  impressions: number
}

interface ActivityEntry {
  id: string
  type: string
  title: string
  description?: string
  createdAt: string
  user?: { name?: string; email?: string } | null
  client?: { name?: string } | null
  targetUrl?: string
}

interface CostHistoryEntry {
  label: string
  infrastructure: number
  api: number
  llm: number
  business: number
}

interface RecentProcess {
  id: number
  processTitle: string
  overallStatus: string
  currentPhase: string
  completionPercentage: number
  updatedAt: string
}

interface XeroInvoice {
  invoiceId?: string
  invoiceNumber: string
  contact: { name: string }
  description?: string
  total: number
  amountDue: number
  dueDate?: string
  status: string
  isOverdue?: boolean
  reference?: string
}

interface XeroInvoiceSummary {
  totalOutstanding: number
  totalOverdue: number
  overdueCount: number
  unpaidCount: number
  draftCount: number
  recentInvoices: XeroInvoice[]
  draftInvoices?: XeroInvoice[]
}

interface XeroScheduledSend {
  invoiceId: string
  sendDate: string | null
  description: string
  status: 'draft' | 'scheduled'
  contact: string
  total: number
}

interface ProcessesData {
  active: number
  notStarted: number
  completed: number
  onHold: number
  recentProcesses: RecentProcess[]
}

interface TeamTasksData {
  notStarted: number
  inProgress: number
  readyForReview: number
  completedThisMonth: number
  postponed: number
  overdue: number
  perAssignee: Array<{
    userId: string | number | null
    name: string
    active: number
    readyForReview: number
  }>
}

interface RealtimeVoiceCostData {
  estimatedCostAud: number
  durationSeconds: number
  calls: number
}

interface DashboardData {
  gsc: GscData | null
  gscMonthly: GscMonthlyEntry[]
  activeClients: number
  totalRetainer: number
  ytdRevenue: number
  monthlyRetainerNet: number
  annualisedAgencyRevenue: number
  oneOffYTD: number
  retainerYTD: number
  activity: ActivityEntry[]
  userRole: string
  userName: string
  proposals: {
    active: number
    converted: number
    total: number
    conversionRate: number
  }
  usage: {
    seoAudits: number
    croAudits: number
    keywordSnapshots: number
    competitorAnalyses: number
    contentResearches: number
    mediaUploads: number
  }
  costs: {
    period?: string
    api: Record<string, number>
    apiTotal: number
    infrastructure: Record<string, number>
    infraTotal: number
    llm: Record<string, number>
    llmTotal: number
    total: number
  }
  costHistory: CostHistoryEntry[]
  totalLeads?: number
  activeLeads?: number
  businessCosts?: {
    totalThisMonth: number
    totalLastMonth?: number
    uncategorisedCount: number
  }
  processes?: ProcessesData | null
  teamTasks?: TeamTasksData | null
  realtimeVoiceCost?: RealtimeVoiceCostData | null
  salesTarget?: {
    target: number
  } | null
  wcqAssessmentTarget?: {
    current: number
    target: number
  } | null
  kpiMom?: {
    activeClients?: KpiDelta
    activeLeads?: KpiDelta
    arr?: KpiDelta
    monthlyRetainer?: KpiDelta
    retainerYTD?: KpiDelta
    oneOffYTD?: KpiDelta
    leadConversion?: KpiDelta
    mtdCosts?: KpiDelta
  }
  breakdowns?: {
    monthlyRetainer: Array<{
      clientName: string
      gross: number
      commission: number
      net: number
      revenueSharePercent?: number | null
    }>
    oneOffYTD: Array<{
      clientName: string
      projectName: string
      amount: number
      date: string
    }>
    retainerYTD: Array<{
      clientName: string
      monthlyNetSum: number
      setupFee: number
      retainerOneOffs: Array<{ projectName: string; amount: number }>
      priorPeriodThisYear?: number
      total: number
      revenueSharePercent?: number | null
    }>
  }
  month: string
}

// ── Hover-tooltip stat box ──
// The tooltip is rendered via a React portal into <body> so it escapes
// the topline box's `overflow: hidden` clip. Position is computed from
// the host tile's bounding rect on hover/focus.
function StatWithTooltip({
  value,
  label,
  rows,
  emptyHint,
  dotColor,
}: {
  value: string
  label: string
  rows: React.ReactNode[]
  emptyHint?: string
  dotColor?: string
}) {
  const hasRows = rows.length > 0
  const hostRef = useRef<HTMLDivElement | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)
  const [tipLeft, setTipLeft] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  // Small delay before hiding so the mouse has time to cross from the host
  // tile into the floating tooltip without the tooltip vanishing mid-move.
  // Cleared if the mouse re-enters either the host or the tooltip first.
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const updateCoords = () => {
    const el = hostRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setCoords({
      top: rect.bottom + 8,
      left: rect.left + rect.width / 2,
      width: rect.width,
    })
  }

  const cancelHide = () => {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  const show = () => {
    if (!hasRows) return
    cancelHide()
    updateCoords()
    setOpen(true)
  }
  const scheduleHide = () => {
    cancelHide()
    hideTimerRef.current = setTimeout(() => setOpen(false), 140)
  }

  // Reposition while open in case the window scrolls/resizes.
  useEffect(() => {
    if (!open) return
    const handler = () => updateCoords()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [open])

  // After the tooltip renders, measure it and clamp its centre so it never
  // runs off the viewport edge (mobile fix).
  useLayoutEffect(() => {
    if (!open || !coords || !tipRef.current) return
    setTipLeft(clampTooltipCenter(coords.left, tipRef.current.offsetWidth))
  }, [open, coords])

  // Clear any pending hide timer when the component unmounts.
  useEffect(() => {
    return () => cancelHide()
  }, [])

  return (
    <div
      ref={hostRef}
      className="od-box__stat od-box__stat--hoverable"
      tabIndex={hasRows ? 0 : -1}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onFocus={show}
      onBlur={scheduleHide}
    >
      <span className="od-box__stat-value">{value}</span>
      <span className="od-box__stat-label">
        {dotColor && <span className="od-kpi-dot" style={{ background: dotColor }} />}
        {label}
      </span>
      {!hasRows && emptyHint && <span className="od-box__stat-hint">{emptyHint}</span>}
      {mounted && hasRows && open && coords &&
        createPortal(
          <div
            ref={tipRef}
            className="od-stat-tooltip od-stat-tooltip--portal"
            role="tooltip"
            // Keep the tooltip visible while the cursor is over it, so users
            // can scroll inside long lists. The host's onMouseLeave fires when
            // the cursor crosses into the tooltip — cancelling the hide here
            // (and on the host re-enter) is what makes the bridge work.
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
            style={{ top: coords.top, left: tipLeft ?? coords.left, minWidth: coords.width }}
          >
            <div className="od-stat-tooltip__head">{label}</div>
            <div className="od-stat-tooltip__body">{rows}</div>
          </div>,
          document.body,
        )}
    </div>
  )
}

// ─── KPI Card (individual tile, mockup style) ───────────────

interface KpiDelta {
  text: string
  dir: 'up' | 'down' | 'flat'
}

function KpiCard({
  label,
  value,
  dotColor,
  delta,
}: {
  label: string
  value: string
  dotColor?: string
  delta?: KpiDelta
}) {
  return (
    <div className="od-kpi">
      <div className="od-kpi__label">
        {dotColor && <span className="od-kpi-dot" style={{ background: dotColor }} />}
        {label}
      </div>
      <div className="od-kpi__value">{value}</div>
      {delta && <div className={`od-kpi__delta od-kpi__delta--${delta.dir}`}>{delta.text}</div>}
    </div>
  )
}

function KpiCardTooltip({
  label,
  value,
  rows,
  dotColor,
  delta,
}: {
  label: string
  value: string
  rows: React.ReactNode[]
  dotColor?: string
  delta?: KpiDelta
}) {
  const hasRows = rows.length > 0
  const hostRef = useRef<HTMLDivElement | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)
  const [tipLeft, setTipLeft] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setMounted(true) }, [])

  const updateCoords = () => {
    const el = hostRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setCoords({ top: rect.bottom + 8, left: rect.left + rect.width / 2, width: rect.width })
  }

  const cancelHide = () => {
    if (hideTimerRef.current != null) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
  }

  const show = () => { if (!hasRows) return; cancelHide(); updateCoords(); setOpen(true) }
  const scheduleHide = () => { cancelHide(); hideTimerRef.current = setTimeout(() => setOpen(false), 140) }

  useEffect(() => {
    if (!open) return
    const handler = () => updateCoords()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => { window.removeEventListener('scroll', handler, true); window.removeEventListener('resize', handler) }
  }, [open])

  // Clamp the tooltip's centre to the viewport once it has rendered (mobile fix).
  useLayoutEffect(() => {
    if (!open || !coords || !tipRef.current) return
    setTipLeft(clampTooltipCenter(coords.left, tipRef.current.offsetWidth))
  }, [open, coords])

  useEffect(() => { return () => cancelHide() }, [])

  return (
    <div
      ref={hostRef}
      className="od-kpi"
      style={{ cursor: hasRows ? 'default' : undefined }}
      tabIndex={hasRows ? 0 : -1}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onFocus={show}
      onBlur={scheduleHide}
    >
      <div className="od-kpi__label">
        {dotColor && <span className="od-kpi-dot" style={{ background: dotColor }} />}
        {label}
      </div>
      <div className="od-kpi__value">{value}</div>
      {delta && <div className={`od-kpi__delta od-kpi__delta--${delta.dir}`}>{delta.text}</div>}
      {mounted && hasRows && open && coords &&
        createPortal(
          <div
            ref={tipRef}
            className="od-stat-tooltip od-stat-tooltip--portal"
            role="tooltip"
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
            style={{ top: coords.top, left: tipLeft ?? coords.left, minWidth: coords.width }}
          >
            <div className="od-stat-tooltip__head">{label}</div>
            <div className="od-stat-tooltip__body">{rows}</div>
          </div>,
          document.body,
        )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────

const hiddenActivityTypes = new Set([
  'agent_reasoning',
  'agent_tool_call',
  'agent_final_output',
  'agent_fallback',
  'agent_failover',
  'oauth_success',
  'agent_auth_event',
])

const hiddenActivityText = [
  'agent reasoning',
  'agent tool call',
  'agent tool calls',
  'agent final output',
  'agent fallback',
  'agents fallback',
  'agent failover',
  'agents failover',
  'oauth success',
  'provider-failover',
  'provider failover',
  'moonshot: provider-failover',
  '[auth]',
]

function isDashboardActivityVisible(entry: ActivityEntry): boolean {
  const normalizedType = entry.type.toLowerCase().replaceAll('-', '_')
  if (hiddenActivityTypes.has(normalizedType)) return false

  const searchable = `${entry.type} ${entry.title} ${entry.description || ''}`.toLowerCase()
  return !hiddenActivityText.some((text) => searchable.includes(text))
}

const typeLabels: Record<string, string> = {
  blog_published: 'Blog',
  seo_audit_completed: 'SEO Audit',
  cro_audit_completed: 'CRO Audit',
  keyword_analysis: 'Keywords',
  client_added: 'New Client',
  retainer_changed: 'Retainer',
  proposal_created: 'Proposal',
  gsc_snapshot: 'GSC',
  time_tracked: 'Time Tracked',
  team_task_ready_for_review: 'Task Review',
  team_task_completed: 'Task Complete',
  lead_created: 'New Lead',
  lead_stage_changed: 'Lead Update',
}

// Format a dollar amount with no decimal places (en-AU thousand separators).
function fmt0(n: number): string {
  return n.toLocaleString('en-AU', { maximumFractionDigits: 0 })
}

function formatVoiceDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins === 0 ? `${hours} hr` : `${hours} hr ${mins} min`
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const mins = Math.floor(seconds / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

// Inline `.d` delta cell (mockup style) from a real percentage change.
// `suffix` controls the unit ('%' for rates, '' for absolute position deltas).
// `inverted` flips the good/bad colour (e.g. Avg Position improves as it drops).
function StatDelta({
  value,
  suffix = '%',
  inverted,
}: {
  value?: number
  suffix?: string
  inverted?: boolean
}) {
  if (value == null || value === 0) {
    return <div className="d flat">{'\u2014'}</div>
  }
  const up = value > 0
  const isGood = inverted ? value < 0 : value > 0
  const arrow = up ? '\u25B2' : '\u25BC'
  return (
    <div className={`d ${isGood ? 'up' : 'down'}`}>
      {arrow} {Math.abs(value).toFixed(1)}{suffix}
    </div>
  )
}

// Full-width section band header (mockup .band-h): eyebrow + title + optional
// right-aligned control slot.
function OdBandHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow: string
  title: string
  right?: React.ReactNode
}) {
  return (
    <div className="od-band">
      <div className="od-band__text">
        <span className="od-band__eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <div className="od-band__spacer" />
      {right}
    </div>
  )
}

const infraLabels: Record<string, string> = {
  vercel: 'Vercel Pro',
  railway: 'Railway',
  turso: 'Turso DB',
  blobStorage: 'Blob Storage',
  screenshotOne: 'ScreenshotOne',
  sendGrid: 'SendGrid',
  domain: 'Domain',
}

const apiLabels: Record<string, string> = {
  seoAudits: 'SEO Audits',
  croAudits: 'CRO Audits',
  keywords: 'Keywords',
  competitors: 'Competitors',
  content: 'Content Research',
  blogImages: 'Image Gen',
}

const llmLabels: Record<string, string> = {
  claudeCode: 'Claude Code',
  chatGPT: 'ChatGPT',
  kimi: 'Kimi',
}

const CHART_COLORS = {
  infrastructure: '#213843', // dark
  api: '#468D8B',            // mid
  llm: '#74B3A8',            // light
  business: '#E67E22',       // orange
}

// ─── Main ─────────────────────────────────────────────────

const Dashboard = () => {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [gscRefreshing, setGscRefreshing] = useState(false)
  const [gscSeeding, setGscSeeding] = useState(false)
  const [xeroInvoices, setXeroInvoices] = useState<XeroInvoiceSummary | null>(null)
  const [xeroScheduled, setXeroScheduled] = useState<XeroScheduledSend[]>([])
  const [xeroLoading, setXeroLoading] = useState(true)
  const [costDetailsOpen, setCostDetailsOpen] = useState(false)
  const [statementsSummary, setStatementsSummary] = useState<{ pendingCount: number; totalOutstanding: number } | null>(null)

  const fetchDashboard = () => {
    return fetch('/api/dashboard')
      .then((r) => {
        if (!r.ok) {
          console.error('[Dashboard] API returned', r.status, r.statusText)
          return null
        }
        return r.json()
      })
      .then((d) => { if (d && !d.error) setData(d); setLoading(false) })
      .catch((err) => { console.error('[Dashboard] fetch error:', err); setLoading(false) })
  }

  const handleGscSeed = async () => {
    if (gscSeeding) return
    setGscSeeding(true)
    try {
      await fetch('/api/gsc/seed', { method: 'POST' })
      await fetchDashboard()
    } catch {
      // silently fail
    } finally {
      setGscSeeding(false)
    }
  }

  const handleGscRefresh = async () => {
    if (!data?.gsc?.clientId || gscRefreshing) return
    setGscRefreshing(true)
    try {
      await fetch('/api/gsc/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: data.gsc.clientId }),
      })
      await fetchDashboard()
    } catch {
      // silently fail
    } finally {
      setGscRefreshing(false)
    }
  }

  const fetchXeroData = () => {
    Promise.all([
      fetch('/api/xero/invoices').then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/xero/scheduled-sends').then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/invoice-statements/pending-summary').then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([invoices, scheduled, statements]) => {
      if (invoices && !invoices.error) setXeroInvoices(invoices)
      if (Array.isArray(scheduled)) setXeroScheduled(scheduled)
      if (statements && !statements.error) setStatementsSummary(statements)
      setXeroLoading(false)
    })
  }

  useEffect(() => {
    fetchDashboard()
    fetchXeroData()
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      if (!gscRefreshing) {
        fetch('/api/dashboard')
          .then((r) => r.ok ? r.json() : null)
          .then((d) => { if (d && !d.error) setData(d) })
          .catch((err) => console.error('[Dashboard] refresh error:', err))
      }
      fetchXeroData()
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return <RocketSplash />
  }

  if (!data) {
    return (
      <div className="od-dash">
        <p style={{ color: 'var(--theme-elevation-400)', padding: '60px 0' }}>Could not load dashboard data. Check the browser console for details.</p>
        <button type="button" onClick={() => { setLoading(true); fetchDashboard() }} style={{ background: 'var(--theme-elevation-100)', border: '1px solid var(--theme-elevation-200)', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', color: 'inherit' }}>Retry</button>
      </div>
    )
  }

  return (
    <div className="od-dash">
      {/* Header */}
      <div className="od-dash__header">
        <div>
          <h1 className="od-dash__title">Good morning, {data.userName}</h1>
          <span className="od-dash__month">Agency overview · {data.month}</span>
        </div>
        <a href="/admin/collections/client-proposals/create" className="od-dash__new-client">
          + New Proposal
        </a>
      </div>

      {/* Topline KPI strip — 8 individual cards, full width above layout grid */}
      <div className="od-kpi-strip">
            <KpiCard
              label="Active Clients"
              dotColor="#6366f1"
              value={String(data.activeClients)}
              delta={data.kpiMom?.activeClients}
            />
            <KpiCard
              label="Active Leads"
              dotColor="#7c3aed"
              value={String(data.activeLeads ?? data.totalLeads ?? 0)}
              delta={data.kpiMom?.activeLeads}
            />
            <KpiCard
              label="ARR"
              dotColor="#0d9488"
              value={`$${fmt0(data.annualisedAgencyRevenue ?? 0)}`}
              delta={data.kpiMom?.arr}
            />
            <KpiCardTooltip
              label="Monthly Retainer"
              dotColor="#7c3aed"
              value={`$${fmt0(data.monthlyRetainerNet ?? 0)}`}
              delta={data.kpiMom?.monthlyRetainer}
              rows={(data.breakdowns?.monthlyRetainer ?? []).map((row, i) => (
                <div key={i} className="od-stat-tooltip__row">
                  <span className="od-stat-tooltip__name">
                    {row.clientName}
                    {row.revenueSharePercent != null && (
                      <span className="od-stat-tooltip__share"> ({row.revenueSharePercent}% share)</span>
                    )}
                  </span>
                  <span className="od-stat-tooltip__detail">
                    ${fmt0(row.gross)} gross
                    {row.commission > 0 && (
                      <>
                        {' − '}${fmt0(row.commission)} commission{' → '}
                        <strong>${fmt0(row.net)} net</strong>
                      </>
                    )}
                  </span>
                </div>
              ))}
            />
            <KpiCardTooltip
              label="Retainer Rev. YTD"
              value={`$${fmt0(data.retainerYTD ?? 0)}`}
              delta={data.kpiMom?.retainerYTD}
              rows={(data.breakdowns?.retainerYTD ?? []).map((row, i) => (
                <div key={i} className="od-stat-tooltip__row">
                  <span className="od-stat-tooltip__name">
                    {row.clientName}
                    {row.revenueSharePercent != null && (
                      <span className="od-stat-tooltip__share"> ({row.revenueSharePercent}% share)</span>
                    )}
                  </span>
                  <span className="od-stat-tooltip__detail">
                    Retainer net: ${fmt0(row.monthlyNetSum)}
                    {row.setupFee > 0 && (
                      <>
                        {' • Setup: '}${fmt0(row.setupFee)}
                      </>
                    )}
                    {(row.priorPeriodThisYear ?? 0) > 0 && (
                      <>
                        {' • Prior-period (this year): '}
                        ${fmt0(row.priorPeriodThisYear ?? 0)}
                      </>
                    )}
                    {row.retainerOneOffs.length > 0 && (
                      <>
                        {' • Extras: '}
                        {row.retainerOneOffs
                          .map((p) => `${p.projectName} $${fmt0(p.amount)}`)
                          .join(', ')}
                      </>
                    )}
                    {' → '}<strong>${fmt0(row.total)}</strong>
                  </span>
                </div>
              ))}
            />
            <KpiCardTooltip
              label="One-Off Projects YTD"
              value={`$${fmt0(data.oneOffYTD ?? 0)}`}
              delta={data.kpiMom?.oneOffYTD}
              rows={(data.breakdowns?.oneOffYTD ?? []).map((row, i) => (
                <div key={i} className="od-stat-tooltip__row">
                  <span className="od-stat-tooltip__name">{row.clientName}</span>
                  <span className="od-stat-tooltip__detail">
                    {row.projectName} — <strong>${fmt0(row.amount)}</strong>
                  </span>
                </div>
              ))}
            />
            <KpiCard
              label="Lead Conversion"
              value={`${data.proposals.conversionRate}%`}
              delta={data.kpiMom?.leadConversion}
            />
            <KpiCard
              label="MTD Costs"
              dotColor="#f59e0b"
              value={`$${fmt0(data.costs.total + (data.businessCosts?.totalThisMonth || 0))}`}
              delta={data.kpiMom?.mtdCosts}
            />
      </div>

      {/* Yearly Sales Target Progress Bar */}
      {data.salesTarget && data.salesTarget.target > 0 && (
        <YearlySalesTargetBar
          target={data.salesTarget.target}
          current={data.ytdRevenue}
        />
      )}

      <div className="od-dash__layout">
        {/* ── Left Column ── */}
        <div className="od-dash__main">

          {/* Search Console */}
          <GscCard gsc={data.gsc} gscMonthly={data.gscMonthly} refreshing={gscRefreshing} onRefresh={handleGscRefresh} onSeed={handleGscSeed} seeding={gscSeeding} />

          {/* Costs */}
          <div className="od-box">
            <div className="od-box__head">
              <div>
                <span className="od-box__eyebrow">Finance</span>
                <span className="od-box__title">Costs — {data.costs.period || data.month}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <a href="/admin/finance/costs" style={{ fontSize: 12, color: 'var(--theme-elevation-500)', textDecoration: 'none' }}>
                  Categorise costs &rarr;
                </a>
                <button className="od-costs__head-toggle" onClick={() => setCostDetailsOpen(!costDetailsOpen)} type="button">
                  {costDetailsOpen ? 'Hide details ⌃' : 'Show details ⌄'}
                </button>
              </div>
            </div>
            <div className="od-box__body">
              {data.businessCosts && (
                <div className="od-card-pad od-card-pad--bottom-tight">
                  <div className="od-gsc-stats od-gsc-stats--2">
                    <div className="od-stat">
                      <div className="k">Business Costs MTD</div>
                      <div className="v">${data.businessCosts.totalThisMonth.toFixed(0)}</div>
                      <div className="d">Included in top MTD Costs</div>
                    </div>
                    <div className="od-stat">
                      <div className="k">Uncategorised</div>
                      <div className="v" style={data.businessCosts.uncategorisedCount > 0 ? { color: '#f59e0b' } : {}}>
                        {data.businessCosts.uncategorisedCount}
                      </div>
                      <div className="d" style={data.businessCosts.uncategorisedCount > 0 ? { color: '#f59e0b' } : {}}>
                        {data.businessCosts.uncategorisedCount > 0 ? '⚠ Needs review' : 'All categorised'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <CostBreakdown data={data} open={costDetailsOpen} />
            </div>
          </div>

          {/* Outstanding Invoices & Scheduled Sends */}
          <XeroInvoicesCard invoices={xeroInvoices} scheduled={xeroScheduled} loading={xeroLoading} onRefresh={fetchXeroData} />
        </div>

        {/* ── Right Column ── */}
        <div className="od-dash__side">
          {/* WeCanQuit assessment target — unique to this one client */}
          {data.wcqAssessmentTarget && data.wcqAssessmentTarget.target > 0 && (
            <WcqAssessmentTargetBar
              current={data.wcqAssessmentTarget.current}
              target={data.wcqAssessmentTarget.target}
            />
          )}

          <ActivityFeed entries={data.activity} />

          {/* Team Tasks */}
          <TeamTasksCard teamTasks={data.teamTasks} />

          {/* Action Items */}
          <ActionItems
            uncategorisedCosts={data.businessCosts?.uncategorisedCount ?? 0}
            pendingStatements={statementsSummary?.pendingCount ?? 0}
          />

          {/* Pending Statements banner */}
          {statementsSummary && statementsSummary.pendingCount > 0 && (
            <a
              href="/admin/finance/invoice-statements"
              style={{
                display: 'block',
                padding: '14px 18px',
                background: '#fffbeb',
                border: '1px solid #fcd34d',
                borderRadius: 12,
                textDecoration: 'none',
                color: 'inherit',
                boxShadow: '0 1px 3px rgba(16,24,40,.07)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                    Pending statements
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4, color: '#78350f' }}>
                    {statementsSummary.pendingCount} client{statementsSummary.pendingCount === 1 ? '' : 's'} · ${statementsSummary.totalOutstanding.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} awaiting approval
                  </div>
                </div>
                <div style={{ fontSize: 13, color: '#b45309', fontWeight: 600 }}>Review →</div>
              </div>
            </a>
          )}

          {/* Realtime Voice Cost */}
          <RealtimeVoiceCostCard usage={data.realtimeVoiceCost} />

          {/* Client Processes */}
          <ProcessesCard processes={data.processes} />
        </div>
      </div>

      {/* Google Analytics (full width) */}
      <Ga4Card />

      {/* ── Sales Funnel (full-width below main grid) ── */}
      <SalesFunnelDashboard />

      {/* ── Drip Email Tracker (below sales funnel) ── */}
      <DripEmailTracker />
    </div>
  )
}

// ─── GSC Card ─────────────────────────────────────────────

function GscCard({
  gsc,
  gscMonthly,
  refreshing,
  onRefresh,
  onSeed,
  seeding,
}: {
  gsc: GscData | null
  gscMonthly: GscMonthlyEntry[]
  refreshing: boolean
  onRefresh: () => void
  onSeed: () => void
  seeding: boolean
}) {
  const [chartPeriod, setChartPeriod] = useState<'30d' | '90d' | '12m'>('90d')

  if (!gsc || (!gsc.totalClicks && !gsc.gscConnected)) {
    return (
      <div className="od-box od-box--muted">
        <div className="od-box__head">
          <div>
            <span className="od-box__eyebrow">Search</span>
            <span className="od-box__title">Google Search Console</span>
          </div>
        </div>
        <div className="od-box__body" style={{ padding: '24px 20px', textAlign: 'center' }}>
          <p style={{ color: 'var(--theme-elevation-400)', fontSize: 13, margin: '0 0 12px' }}>
            Connect GSC in Settings &rarr; Integrations to see search performance data.
          </p>

        </div>
      </div>
    )
  }

  const hasSnapshot = (gsc.totalClicks ?? 0) > 0 || (gsc.totalImpressions ?? 0) > 0
  const visibleGscMonthly = gscMonthly.slice(-(chartPeriod === '30d' ? 1 : chartPeriod === '90d' ? 3 : 12))

  return (
    <div className="od-box">
      <div className="od-box__head">
        <div>
          <span className="od-box__eyebrow">Search</span>
          <span className="od-box__title">Google Search Console</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {gscMonthly.length > 0 && (
            <div className="od-seg">
              {(['30d', '90d', '12m'] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setChartPeriod(period)}
                  className={chartPeriod === period ? 'od-seg--active' : undefined}
                >
                  {period}
                </button>
              ))}
            </div>
          )}
          {gsc.periodStart && gsc.periodEnd && (
            <span className="od-box__period">
              {new Date(gsc.periodStart).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              {' \u2013 '}
              {new Date(gsc.periodEnd).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            </span>
          )}
          <button
            className="od-gsc__refresh"
            onClick={onRefresh}
            disabled={refreshing}
            type="button"
            title="Refresh GSC data"
          >
            {refreshing ? 'Syncing...' : '↻ Refresh'}
          </button>

        </div>
      </div>

      {hasSnapshot ? (
        <div className="od-box__body od-card-pad">
          <div className="od-gsc-stats">
            <div className="od-stat">
              <div className="k">Clicks</div>
              <div className="v">{(gsc.totalClicks ?? 0).toLocaleString()}</div>
              <StatDelta value={gsc.clicksChange} />
            </div>
            <div className="od-stat">
              <div className="k">Impressions</div>
              <div className="v">{(gsc.totalImpressions ?? 0).toLocaleString()}</div>
              <StatDelta value={gsc.impressionsChange} />
            </div>
            <div className="od-stat">
              <div className="k">CTR</div>
              <div className="v">{(gsc.avgCtr ?? 0).toFixed(1)}%</div>
              <StatDelta value={gsc.ctrChange} />
            </div>
            <div className="od-stat">
              <div className="k">Avg Position</div>
              <div className="v">{(gsc.avgPosition ?? 0).toFixed(1)}</div>
              <StatDelta value={gsc.positionChange} suffix="" inverted />
            </div>
            <div className="od-stat">
              <div className="k">Keywords</div>
              <div className="v">{(gsc.uniqueKeywords ?? 0).toLocaleString()}</div>
            </div>
            <div className="od-stat">
              <div className="k">Pages</div>
              <div className="v">{(gsc.uniquePages ?? 0).toLocaleString()}</div>
            </div>
          </div>

          {visibleGscMonthly.length > 0 && <GscChart data={visibleGscMonthly} />}
        </div>
      ) : (
        <div className="od-box__body" style={{ padding: '24px 20px', textAlign: 'center' }}>
          <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>
            GSC is connected. Click Refresh to pull the first snapshot.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── GSC Monthly Chart (dual lines, pure CSS/SVG) ──────

function GscChart({ data }: { data: GscMonthlyEntry[] }) {
  const maxClicks = Math.max(...data.map((d) => d.clicks), 1)

  const maxImpressions = Math.max(...data.map((d) => d.impressions), 1)
  const points = data.map((entry, index) => {
    const x = data.length === 1 ? 50 : (index / (data.length - 1)) * 100
    const y = 100 - (entry.impressions / maxImpressions) * 86
    return `${x},${Math.max(8, y)}`
  }).join(' ')

  return (
    <div className="od-gsc-chart od-gsc-chart--mockup">
      <div className="od-gsc-bars">
        <svg className="od-gsc-bars__line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={points} fill="none" stroke="#6366f1" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        {data.map((entry, index) => (
          <div
            key={entry.month}
            className={`od-gsc-bars__bar${index % 3 === 2 ? ' od-gsc-bars__bar--dark' : ''}`}
            style={{ height: `${Math.max(8, (entry.clicks / maxClicks) * 92)}%` }}
            title={`${entry.month}: ${entry.clicks.toLocaleString()} clicks · ${entry.impressions.toLocaleString()} impressions`}
          />
        ))}
      </div>
      <div className="od-chart__legend">
        <span className="od-chart__legend-item">
          <span className="od-chart__legend-dot" style={{ background: '#74B3A8' }} />
          Clicks (bars)
        </span>
        <span className="od-chart__legend-item">
          <span className="od-chart__legend-dot" style={{ background: '#6366f1' }} />
          Impressions (line)
        </span>
      </div>
    </div>
  )
}

// ─── Cost Chart (stacked bar, pure CSS/SVG) ───────────────

function CostChart({ history }: { history: CostHistoryEntry[] }) {
  if (!history || history.length === 0) return null

  const maxTotal = Math.max(...history.map((h) => h.infrastructure + h.api + h.llm + (h.business || 0)), 1)
  const chartHeight = 160
  const barWidth = 100 / history.length

  return (
    <div className="od-chart">
      <div className="od-chart__area" style={{ height: chartHeight }}>
        {history.map((entry, i) => {
          const biz = entry.business || 0
          const total = entry.infrastructure + entry.api + entry.llm + biz
          const bizH = (biz / maxTotal) * chartHeight
          const infraH = (entry.infrastructure / maxTotal) * chartHeight
          const apiH = (entry.api / maxTotal) * chartHeight
          const llmH = (entry.llm / maxTotal) * chartHeight
          return (
            <div
              key={entry.label}
              className="od-chart__bar-group"
              style={{ width: `${barWidth}%` }}
            >
              <div className="od-chart__bar" style={{ height: chartHeight }}>
                <div
                  className="od-chart__segment"
                  style={{ height: llmH, background: CHART_COLORS.llm }}
                  title={`LLM: $${entry.llm.toFixed(2)}`}
                />
                <div
                  className="od-chart__segment"
                  style={{ height: apiH, background: CHART_COLORS.api }}
                  title={`API: $${entry.api.toFixed(2)}`}
                />
                <div
                  className="od-chart__segment"
                  style={{ height: infraH, background: CHART_COLORS.infrastructure }}
                  title={`Infra: $${entry.infrastructure.toFixed(2)}`}
                />
                <div
                  className="od-chart__segment od-chart__segment--label"
                  style={{ height: bizH, background: CHART_COLORS.business }}
                  title={`Business: $${biz.toFixed(2)}`}
                >
                  <span className="od-chart__bar-value">${total.toFixed(0)}</span>
                </div>
              </div>
              <div className="od-chart__label">{entry.label}</div>
            </div>
          )
        })}
      </div>
      <div className="od-chart__legend">
        <span className="od-chart__legend-item">
          <span className="od-chart__legend-dot" style={{ background: CHART_COLORS.business }} />
          Business Costs
        </span>
        <span className="od-chart__legend-item">
          <span className="od-chart__legend-dot" style={{ background: CHART_COLORS.infrastructure }} />
          Infrastructure
        </span>
        <span className="od-chart__legend-item">
          <span className="od-chart__legend-dot" style={{ background: CHART_COLORS.api }} />
          API Usage
        </span>
        <span className="od-chart__legend-item">
          <span className="od-chart__legend-dot" style={{ background: CHART_COLORS.llm }} />
          LLM Models
        </span>
      </div>
    </div>
  )
}

// ─── Cost Breakdown (mockup card) ──────────────────────────

function CostBreakdown({ data, open }: { data: DashboardData; open: boolean }) {
  const countMap: Record<string, number> = {
    seoAudits: data.usage.seoAudits,
    croAudits: data.usage.croAudits,
    keywords: data.usage.keywordSnapshots,
    competitors: data.usage.competitorAnalyses,
    content: data.usage.contentResearches,
    blogImages: data.usage.mediaUploads,
  }

  const business = data.businessCosts?.totalLastMonth ?? data.businessCosts?.totalThisMonth ?? 0
  const infra = data.costs.infraTotal
  const api = data.costs.apiTotal
  const llm = data.costs.llmTotal
  const total = business + infra + api + llm
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)
  const groups = [
    { key: 'business', label: 'Business', value: business, color: CHART_COLORS.business },
    { key: 'infra', label: 'Infra', value: infra, color: CHART_COLORS.infrastructure },
    { key: 'api', label: 'API', value: api, color: CHART_COLORS.api },
    { key: 'llm', label: 'LLM', value: llm, color: CHART_COLORS.llm },
  ]

  return (
    <div className="od-costs">
      <div className="od-costs__summary od-costs__summary--total">
        <span className="od-costs__summary-label">Total</span>
        <span className="od-costs__summary-value">${total.toFixed(2)}</span>
        <span className="od-costs__summary-sub">AUD / month</span>
      </div>
      <div className="od-costs__summary-row">
        {groups.map((group) => (
          <div key={group.key} className="od-costs__summary">
            <span className="od-costs__summary-label">
              <span className="od-costs__summary-dot" style={{ background: group.color }} />
              {group.label}
            </span>
            <span className="od-costs__summary-value">${group.value.toFixed(2)}</span>
          </div>
        ))}
      </div>

      {total > 0 && (
        <div className="od-stackbar" aria-label="Cost category split">
          {groups.map((group) => (
            <span
              key={group.key}
              style={{ width: `${pct(group.value)}%`, background: group.color }}
              title={`${group.label} $${group.value.toFixed(2)}`}
            />
          ))}
        </div>
      )}

      {open && (
        <div className="od-costs__details">
          <div className="od-costs__detail-row">
            <div className="od-costs__col">
              <div className="od-costs__section">
                <span className="od-costs__section-dot" style={{ background: CHART_COLORS.business }} />
                Business
              </div>
              <div className="od-costs__grid">
                <div className="od-costs__row">
                  <span className="od-costs__label">Categorised business costs</span>
                  <span className="od-costs__value">${business.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="od-costs__col">
              <div className="od-costs__section">
                <span className="od-costs__section-dot" style={{ background: CHART_COLORS.infrastructure }} />
                Infrastructure
              </div>
              <div className="od-costs__grid">
                {Object.entries(data.costs.infrastructure).map(([key, cost]) => (
                  <div key={key} className="od-costs__row">
                    <span className="od-costs__label">{infraLabels[key] || key}</span>
                    <span className="od-costs__value">${cost.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="od-costs__col">
              <div className="od-costs__section">
                <span className="od-costs__section-dot" style={{ background: CHART_COLORS.api }} />
                API
              </div>
              <div className="od-costs__grid">
                {Object.entries(data.costs.api).map(([key, cost]) => (
                  <div key={key} className="od-costs__row">
                    <span className="od-costs__label">
                      {apiLabels[key] || key}
                      <span className="od-costs__count">&times;{countMap[key] ?? 0}</span>
                    </span>
                    <span className="od-costs__value">${cost.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="od-costs__col">
              <div className="od-costs__section">
                <span className="od-costs__section-dot" style={{ background: CHART_COLORS.llm }} />
                LLM
              </div>
              <div className="od-costs__grid">
                {Object.entries(data.costs.llm).map(([key, cost]) => (
                  <div key={key} className="od-costs__row">
                    <span className="od-costs__label">{llmLabels[key] || key}</span>
                    <span className="od-costs__value">${cost.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Activity Feed ────────────────────────────────────────

export function activityIcon(type: string): string {
  if (type.includes('match_type_violation')) return '≠'
  if (type.includes('task')) return '🧭'
  if (type.includes('proposal')) return '📄'
  if (type.includes('invoice') || type.includes('cost')) return '💰'
  if (type.includes('agent') || type.includes('google')) return '🤖'
  if (type.includes('deploy')) return '🚢'
  if (type.includes('gsc') || type.includes('analytics')) return '📊'
  return '✅'
}

export function activityDescription(entry: ActivityEntry): string | undefined {
  if (!entry.description || !entry.type.includes('match_type_violation') || !entry.client?.name) {
    return entry.description
  }

  return entry.description.replace(/^Client \d+:/, `${entry.client.name}:`)
}

export function activityHref(entry: ActivityEntry): string {
  return entry.targetUrl?.startsWith('/admin/')
    ? entry.targetUrl
    : `/admin/collections/activity-log/${entry.id}`
}

function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  const visibleEntries = entries.filter(isDashboardActivityVisible)

  return (
    <div className="od-box od-box--feed">
      <div className="od-box__head">
        <span className="od-box__title">Activity</span>
        <a href="/admin/collections/activity-log" className="od-feed__see-all">
          See all
        </a>
      </div>
      {visibleEntries.length === 0 ? (
        <div style={{ padding: '24px 20px', color: 'var(--theme-elevation-400)', fontSize: 13 }}>
          No recent activity
        </div>
      ) : (
        <div className="od-feed">
          {visibleEntries.map((entry) => (
            <a key={entry.id} href={activityHref(entry)} className="od-feed__item">
              <div className="od-feed__dot">{activityIcon(entry.type)}</div>
              <div className="od-feed__body">
                <div className="od-feed__title">
                  {entry.title}
                </div>
                {activityDescription(entry) && (
                  <div className="od-feed__desc">{activityDescription(entry)}</div>
                )}
                <div className="od-feed__meta">
                  {entry.user?.name || entry.user?.email || 'System'}
                  {' \u00B7 '}
                  {typeLabels[entry.type] || entry.type}
                  {entry.client?.name ? ` \u00B7 ${entry.client.name}` : ''}
                  {' \u00B7 '}
                  {timeAgo(entry.createdAt)}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── GA4 Card ────────────────────────────────────────────

interface Ga4Data {
  ga4Connected: boolean
  overview?: {
    users: number
    newUsers: number
    sessions: number
    pageviews: number
    bounceRate: number
    avgSessionDuration: number
    engagementRate: number
    conversions: number
  }
  channels?: { channel: string; users: number; newUsers: number; sessions: number; bounceRate: number; avgSessionDuration: number; keyEvents: number }[]
  topPages?: { pagePath: string; pageTitle: string; users: number; pageviews: number }[]
  daily?: { date: string; users: number; sessions: number; pageviews: number }[]
  periodStart?: string
  periodEnd?: string
}

function Ga4Card() {
  const [data, setData] = useState<Ga4Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('12m')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/ga4/query?period=${period}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [period])

  if (loading && !data) {
    return (
      <>
        <OdBandHeader eyebrow="Analytics" title="Google Analytics (GA4)" />
        <div className="od-box od-box--muted">
          <div className="od-box__body" style={{ padding: '24px 20px', textAlign: 'center' }}>
            <p style={{ color: 'var(--theme-elevation-400)', fontSize: 13, margin: 0 }}>Loading GA4 data...</p>
          </div>
        </div>
      </>
    )
  }

  if (!data?.ga4Connected) {
    return (
      <>
        <OdBandHeader eyebrow="Analytics" title="Google Analytics (GA4)" />
        <div className="od-box od-box--muted">
          <div className="od-box__body" style={{ padding: '24px 20px', textAlign: 'center' }}>
            <p style={{ color: 'var(--theme-elevation-400)', fontSize: 13, margin: '0 0 8px' }}>
              Connect GA4 in <a href="/admin/settings/integrations" style={{ color: 'var(--theme-elevation-600)', textDecoration: 'underline' }}>Settings &rarr; Integrations</a> to see live traffic and conversion data.
            </p>
          </div>
        </div>
      </>
    )
  }

  const ov = data.overview
  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60)
    const secs = Math.round(s % 60)
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  const periodSeg = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {data.periodStart && data.periodEnd && (
        <span className="od-box__period">
          {new Date(data.periodStart).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
          {' \u2013 '}
          {new Date(data.periodEnd).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
        </span>
      )}
      <div className="od-seg">
        {(['30d', '90d', '12m'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={period === p ? 'od-seg--active' : undefined}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <>
      <OdBandHeader eyebrow="Analytics" title="Google Analytics (GA4)" right={periodSeg} />
      <div className="od-box">

      {ov && (
        <div className="od-box__stats od-box__stats--6">
          <div className="od-box__stat">
            <span className="od-box__stat-value">{ov.users.toLocaleString()}</span>
            <span className="od-box__stat-label">Users</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{ov.sessions.toLocaleString()}</span>
            <span className="od-box__stat-label">Sessions</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{ov.pageviews.toLocaleString()}</span>
            <span className="od-box__stat-label">Pageviews</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{(ov.bounceRate * 100).toFixed(1)}%</span>
            <span className="od-box__stat-label">Bounce Rate</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{formatDuration(ov.avgSessionDuration)}</span>
            <span className="od-box__stat-label">Avg Duration</span>
          </div>
          <div className="od-box__stat">
            <span className="od-box__stat-value">{ov.conversions.toLocaleString()}</span>
            <span className="od-box__stat-label">Conversions</span>
          </div>
        </div>
      )}

      {/* Daily chart */}
      {data.daily && data.daily.length > 0 && (
        <div style={{ padding: '12px 20px 4px' }}>
          <Ga4Chart data={data.daily} />
        </div>
      )}

      {/* Channel grouping table */}
      {data.channels && data.channels.length > 0 && (
        <div style={{ borderTop: '1px solid var(--theme-elevation-100)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--theme-elevation-100)' }}>
                {['Channel', 'Sessions', 'Users', 'New Users', 'Bounce Rate', 'Avg Duration', 'Key Events'].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Channel' ? 'left' : 'right', fontWeight: 600, color: 'var(--theme-elevation-500)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.channels.slice(0, 10).map((ch) => (
                <tr key={ch.channel} style={{ borderBottom: '1px solid var(--theme-elevation-50)' }}>
                  <td style={{ padding: '6px 12px', fontWeight: 500, color: 'var(--theme-elevation-700)' }}>{ch.channel}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600 }}>{ch.sessions.toLocaleString()}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>{ch.users.toLocaleString()}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>{ch.newUsers.toLocaleString()}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>{(ch.bounceRate * 100).toFixed(1)}%</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>{formatDuration(ch.avgSessionDuration)}</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600 }}>{ch.keyEvents.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </>
  )
}

// ─── Processes Card ──────────────────────────────────────

const PROCESS_STATUS_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  in_progress: { bg: '#dbeafe', color: '#1d4ed8', label: 'Active' },
  not_started: { bg: '#f3f4f6', color: '#6b7280', label: 'Not Started' },
  completed: { bg: '#dcfce7', color: '#15803d', label: 'Completed' },
  on_hold: { bg: '#fef3c7', color: '#b45309', label: 'On Hold' },
  cancelled: { bg: '#fee2e2', color: '#b91c1c', label: 'Cancelled' },
}

// ─── Xero Invoices Card ──────────────────────────────────

function XeroInvoicesCard({
  invoices,
  scheduled,
  loading: xeroLoading,
  onRefresh,
}: {
  invoices: XeroInvoiceSummary | null
  scheduled: XeroScheduledSend[]
  loading: boolean
  onRefresh: () => void
}) {
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    onRefresh()
    setTimeout(() => setRefreshing(false), 2000)
  }

  if (xeroLoading) {
    return (
      <div className="od-box od-box--muted">
        <div className="od-box__head">
          <div>
            <span className="od-box__eyebrow">Finance</span>
            <span className="od-box__title">Outstanding Invoices</span>
          </div>
        </div>
        <div className="od-box__body" style={{ padding: '24px 20px', textAlign: 'center' }}>
          <p style={{ color: 'var(--theme-elevation-400)', fontSize: 13, margin: 0 }}>
            Loading Xero data...
          </p>
        </div>
      </div>
    )
  }

  if (!invoices) {
    return (
      <div className="od-box od-box--muted">
        <div className="od-box__head">
          <div>
            <span className="od-box__eyebrow">Finance</span>
            <span className="od-box__title">Outstanding Invoices</span>
          </div>
        </div>
        <div className="od-box__body" style={{ padding: '24px 20px', textAlign: 'center' }}>
          <p style={{ color: 'var(--theme-elevation-400)', fontSize: 13, margin: 0 }}>
            Could not load Xero data. Check Growth Tools connection.
          </p>
        </div>
      </div>
    )
  }

  const displayedInvoices = [...invoices.recentInvoices, ...(invoices.draftInvoices || [])]

  return (
    <>
      {/* Outstanding Invoices */}
      <div className="od-box">
        <div className="od-box__head">
          <div>
            <span className="od-box__eyebrow">Finance</span>
            <span className="od-box__title">Outstanding Invoices & Scheduled Sends</span>
          </div>
          <button type="button" onClick={handleRefresh} disabled={refreshing} className="od-gsc__refresh">
            {refreshing ? 'Refreshing...' : '↻ Refresh'}
          </button>
        </div>

        {/* KPI stats */}
        <div className="od-box__body od-card-pad od-card-pad--bottom-tight">
          <div className="od-gsc-stats od-gsc-stats--3">
            <div className="od-stat">
              <div className="k">Outstanding</div>
              <div className="v">${invoices.totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
              <div className="d">{displayedInvoices.length} invoices</div>
            </div>
            <div className="od-stat">
              <div className="k">Overdue</div>
              <div className="v" style={invoices.totalOverdue > 0 ? { color: '#ef4444' } : {}}>
                ${invoices.totalOverdue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <div className={invoices.totalOverdue > 0 ? 'd down' : 'd'}>{invoices.totalOverdue > 0 ? 'Needs follow-up' : 'Clear'}</div>
            </div>
            <div className="od-stat">
              <div className="k">Scheduled</div>
              <div className="v">{scheduled.length}</div>
              <div className="d">send{scheduled.length === 1 ? '' : 's'}</div>
            </div>
          </div>
        </div>

        {/* Invoice table */}
        {displayedInvoices.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="od-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Invoice</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {displayedInvoices.map((inv) => {
                  const overdue = Boolean(inv.isOverdue)
                  const isDraft = inv.status === 'DRAFT'
                  const href = inv.invoiceId ? `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${inv.invoiceId}` : null
                  const invoiceLabel = href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {inv.invoiceNumber}
                    </a>
                  ) : inv.invoiceNumber
                  return (
                    <tr key={`${inv.status}-${inv.invoiceId || inv.invoiceNumber}`}>
                      <td className="t-strong">{inv.contact.name}</td>
                      <td className="t-muted">{invoiceLabel}</td>
                      <td>{inv.description || inv.reference || (isDraft ? 'Draft invoice' : 'Outstanding invoice')}</td>
                      <td>
                        <span className={`od-pill ${overdue ? 'od-pill--red' : isDraft ? 'od-pill--amber' : 'od-pill--green'}`}>
                          {overdue ? 'Overdue' : isDraft ? 'Draft' : 'Due'}
                        </span>
                      </td>
                      <td className="num t-strong">${(inv.amountDue || inv.total || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '16px 20px', textAlign: 'center' }}>
            <p style={{ color: 'var(--theme-elevation-400)', fontSize: 13, margin: 0 }}>
              No unpaid or draft invoices 🎉
            </p>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Realtime Voice Cost ──────────────────────────────

function RealtimeVoiceCostCard({ usage }: { usage?: RealtimeVoiceCostData | null }) {
  const cost = usage?.estimatedCostAud ?? 0
  const calls = usage?.calls ?? 0
  const duration = usage?.durationSeconds ?? 0

  return (
    <div className="od-box">
      <div className="od-box__head" style={{ padding: '10px 14px' }}>
        <div>
          <span className="od-box__eyebrow">OpenAI Realtime</span>
          <span className="od-box__title">Voice Cost</span>
        </div>
        <a href="/admin/realtime-voice-usage" className="od-link-small">
          Logs →
        </a>
      </div>
      <div className="od-box__body" style={{ padding: '10px 14px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>
              {cost.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ color: 'var(--theme-elevation-500)', fontSize: 11, marginTop: 3 }}>
              Estimated AUD
            </div>
          </div>
          <div style={{ textAlign: 'right', color: 'var(--theme-elevation-600)', fontSize: 12 }}>
            <strong style={{ color: 'var(--theme-text)' }}>{calls}</strong> calls<br />
            {formatVoiceDuration(duration)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Team Tasks Card ─────────────────────────────────────

function TeamTasksCard({ teamTasks }: { teamTasks?: TeamTasksData | null }) {
  if (!teamTasks) {
    return (
      <div className="od-box od-box--muted">
        <div className="od-box__head">
          <span className="od-box__title">Team Tasks</span>
        </div>
        <div className="od-box__body" style={{ padding: '24px 20px', textAlign: 'center' }}>
          <p style={{ color: 'var(--theme-elevation-400)', fontSize: 13, margin: 0 }}>
            No team task data available yet.
          </p>
        </div>
      </div>
    )
  }

  const openTotal = teamTasks.notStarted + teamTasks.inProgress + teamTasks.readyForReview

  return (
    <div className="od-box">
      <div className="od-box__head">
        <span className="od-box__title">Team Tasks</span>
        <a
          href="/admin/collections/team-tasks"
          style={{ fontSize: 12, color: 'var(--theme-elevation-500)', textDecoration: 'none' }}
        >
          View all &rarr;
        </a>
      </div>
      <div className="od-box__body od-card-pad">
        <div className="od-processes__pills">
          <span className="od-pill od-pill--green">{teamTasks.inProgress} In progress</span>
          <span className="od-pill od-pill--amber">{teamTasks.readyForReview} Review</span>
          <span className="od-pill od-pill--gray">{teamTasks.completedThisMonth} Done MTD</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
          <div className="od-stat" style={{ padding: 10 }}>
            <div className="k">Open</div>
            <div className="v">{openTotal}</div>
          </div>
          <div className="od-stat" style={{ padding: 10 }}>
            <div className="k">Overdue</div>
            <div className="v" style={teamTasks.overdue > 0 ? { color: '#f59e0b' } : {}}>{teamTasks.overdue}</div>
          </div>
          <div className="od-stat" style={{ padding: 10 }}>
            <div className="k">Postponed</div>
            <div className="v">{teamTasks.postponed}</div>
          </div>
        </div>

        {teamTasks.perAssignee.length > 0 ? (
          <div className="od-processes__list" style={{ marginTop: 14 }}>
            {teamTasks.perAssignee.map((row) => (
              <a key={row.userId ?? 'unassigned'} href="/admin/collections/team-tasks" className="od-processes__item">
                <div className="od-processes__row">
                  <b>{row.name}</b>
                  <span>{row.active} active</span>
                </div>
                <div className="od-processes__meta">
                  {row.readyForReview > 0 ? `${row.readyForReview} ready for review` : 'No review items waiting'}
                </div>
              </a>
            ))}
          </div>
        ) : openTotal === 0 ? (
          <div style={{ padding: '16px 0', textAlign: 'center' }}>
            <p style={{ color: 'var(--theme-elevation-400)', fontSize: 13, margin: 0 }}>
              No open team tasks.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ─── Process Status Styles ──────────────────────────────

function ProcessesCard({ processes }: { processes?: ProcessesData | null }) {
  if (!processes) {
    return (
      <div className="od-box od-box--muted">
        <div className="od-box__head">
          <span className="od-box__title">Client Processes</span>
        </div>
        <div className="od-box__body" style={{ padding: '24px 20px', textAlign: 'center' }}>
          <p style={{ color: 'var(--theme-elevation-400)', fontSize: 13, margin: 0 }}>
            No process data available.
          </p>
        </div>
      </div>
    )
  }

  const total = processes.active + processes.notStarted + processes.completed + processes.onHold

  return (
    <div className="od-box">
      <div className="od-box__head">
        <span className="od-box__title">Client Processes</span>
        <a
          href="/admin/collections/client-processes"
          style={{ fontSize: 12, color: 'var(--theme-elevation-500)', textDecoration: 'none' }}
        >
          View all &rarr;
        </a>
      </div>

      <div className="od-box__body od-card-pad od-processes">
        <div className="od-processes__pills">
          <span className="od-pill od-pill--green">{processes.active} On track</span>
          <span className="od-pill od-pill--amber">{processes.onHold} At risk</span>
          <span className="od-pill od-pill--gray">{processes.completed} Done</span>
        </div>

        {processes.recentProcesses.length > 0 ? (
          <div className="od-processes__list">
            {processes.recentProcesses.slice(0, 3).map((proc) => {
              const statusInfo = PROCESS_STATUS_COLORS[proc.overallStatus] || PROCESS_STATUS_COLORS.not_started
              return (
                <a key={proc.id} href={`/admin/collections/client-processes/${proc.id}`} className="od-processes__item">
                  <div className="od-processes__row">
                    <b>{proc.processTitle}</b>
                    <span>{proc.completionPercentage}%</span>
                  </div>
                  <div className="od-mini-prog">
                    <span style={{ width: `${proc.completionPercentage}%` }} />
                  </div>
                  <div className="od-processes__meta">{proc.currentPhase || statusInfo.label} · {timeAgo(proc.updatedAt)}</div>
                </a>
              )
            })}
          </div>
        ) : total === 0 ? (
          <div style={{ padding: '16px 0', textAlign: 'center' }}>
            <p style={{ color: 'var(--theme-elevation-400)', fontSize: 13, margin: 0 }}>
              No processes created yet. Start one from a client or template.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// Simple sparkline chart for daily GA4 data
function Ga4Chart({ data }: { data: { date: string; users: number; sessions: number }[] }) {
  const maxVal = Math.max(...data.map((d) => d.sessions), 1)
  const w = 100 / data.length

  return (
    <div style={{ height: 60, display: 'flex', alignItems: 'flex-end', gap: 1 }}>
      {data.map((d, i) => (
        <div
          key={i}
          title={`${d.date}: ${d.sessions} sessions, ${d.users} users`}
          style={{
            width: `${w}%`,
            height: `${Math.max((d.sessions / maxVal) * 100, 2)}%`,
            background: '#468D8B',
            borderRadius: '2px 2px 0 0',
            minHeight: 2,
            transition: 'height 300ms',
          }}
        />
      ))}
    </div>
  )
}

// ─── Action Items ────────────────────────────────────────

function ActionItems({
  uncategorisedCosts,
  pendingStatements,
}: {
  uncategorisedCosts: number
  pendingStatements: number
}) {
  const items: { label: string; detail: string; href: string; pill?: string; pillClass: string }[] = [
    {
      label: 'Review OptiMate approvals',
      detail: 'Agent actions awaiting sign-off',
      href: '/admin/collections/agent-approval-queue',
      pill: 'Open',
      pillClass: 'od-pill--blue',
    },
    {
      label: 'Invoice statements',
      detail: pendingStatements > 0
        ? `${pendingStatements} client${pendingStatements === 1 ? '' : 's'} awaiting approval`
        : 'No pending statements',
      href: '/admin/finance/invoice-statements',
      pill: pendingStatements > 0 ? 'Due' : undefined,
      pillClass: 'od-pill--amber',
    },
    {
      label: 'Categorise business costs',
      detail: uncategorisedCosts > 0
        ? `${uncategorisedCosts} uncategorised transaction${uncategorisedCosts === 1 ? '' : 's'}`
        : 'All costs categorised',
      href: '/admin/finance/costs',
      pill: uncategorisedCosts > 0 ? 'Later' : undefined,
      pillClass: 'od-pill--gray',
    },
    {
      label: 'Client health check',
      detail: 'Review clients without recent activity',
      href: '/admin/collections/clients',
      pill: 'Urgent',
      pillClass: 'od-pill--red',
    },
  ]

  return (
    <div className="od-box">
      <div className="od-box__head">
        <span className="od-box__title">Action Items</span>
        <span className="od-pill od-pill--amber">{items.length}</span>
      </div>
      <div className="od-box__body od-box__body--flush-top od-card-pad">
        {items.map((item, i) => (
          <a key={i} href={item.href} className="od-toggle-row">
            <div className="od-toggle-row__info">
              <b>{item.label}</b>
              <small>{item.detail}</small>
            </div>
            {item.pill && <span className={`od-pill ${item.pillClass}`}>{item.pill}</span>}
          </a>
        ))}
      </div>
    </div>
  )
}

// ─── Yearly Sales Target Bar ─────────────────────────────

function WcqAssessmentTargetBar({ current, target }: { current: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
  return (
    <div
      className="od-box"
      style={{ marginBottom: 12 }}
      title={`${current.toLocaleString('en-AU')} of ${target.toLocaleString('en-AU')} paid + completed assessments`}
    >
      <div className="od-box__body" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, gap: 8 }}>
          <b style={{ fontSize: 12.5, color: 'var(--od-t1)' }}>WeCanQuit Assessments</b>
          <span style={{ color: 'var(--od-t3)', fontSize: 12 }}>
            <b style={{ color: 'var(--od-t1)' }}>{current.toLocaleString('en-AU')}</b>
            {' / '}{target.toLocaleString('en-AU')} ·{' '}
            <b style={{ color: 'var(--od-green)' }}>{pct}%</b>
          </span>
        </div>
        <div style={{ position: 'relative', height: 8, borderRadius: 20, background: '#eef0f3', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 20, background: 'linear-gradient(90deg, #468d8b, #74b3a8)' }} />
        </div>
      </div>
    </div>
  )
}

function YearlySalesTargetBar({ target, current }: { target: number; current: number }) {
  const percentage = Math.min(100, Math.round((current / target) * 100))
  const now = new Date()
  // Year-end is implicit — the target is by definition for the current
  // calendar year (Jan 1 → Dec 31).
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const yearEnd = new Date(now.getFullYear() + 1, 0, 1)
  const totalDays = Math.max(
    1,
    Math.ceil((yearEnd.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24)),
  )
  const elapsedDays = Math.max(
    0,
    Math.ceil((now.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24)),
  )
  const daysRemaining = Math.max(0, totalDays - elapsedDays)
  const pacePercent = Math.min(100, Math.round((elapsedDays / totalDays) * 100))
  const expectedAmount = Math.round((elapsedDays / totalDays) * target)
  const paceDelta = current - expectedAmount
  const shortMoney = (value: number) => {
    const abs = Math.abs(value)
    const formatted = abs >= 1000
      ? `$${Math.round(abs / 1000).toLocaleString('en-AU')}k`
      : `$${Math.round(abs).toLocaleString('en-AU')}`
    return value < 0 ? `-${formatted}` : formatted
  }

  return (
    <div className="od-box" style={{ marginTop: 16, marginBottom: 16 }}>
      <div className="od-box__body" style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, gap: 12, flexWrap: 'wrap' as const }}>
          <b style={{ fontSize: 13, color: 'var(--od-t1)' }}>Yearly Sales Target</b>
          <span style={{ color: 'var(--od-t3)', fontSize: 12 }}>
            {shortMoney(current)} of {shortMoney(target)} ·{' '}
            <b style={{ color: 'var(--od-green)' }}>{percentage}%</b> ·{' '}
            <b style={{ color: 'var(--od-t2)' }}>{daysRemaining} days remaining</b>
          </span>
        </div>
        <div style={{ position: 'relative', height: 10, borderRadius: 20, background: '#eef0f3', overflow: 'visible' }}>
          <div style={{ width: `${percentage}%`, height: '100%', borderRadius: 20, background: 'linear-gradient(90deg, #468d8b, #74b3a8)' }} />
          <div title="Expected pace" style={{ position: 'absolute', top: -3, left: `${pacePercent}%`, width: 2, height: 16, background: 'var(--od-accent)', borderRadius: 2 }} />
        </div>
        <div style={{ marginTop: 8, fontSize: 11.5 }}>
          <span style={{ color: 'var(--od-accent)', fontWeight: 600 }}>Expected to date: {shortMoney(expectedAmount)}</span>{' '}
          <span style={{ color: 'var(--od-t3)' }}>
            ·{' '}
            <b style={{ color: paceDelta >= 0 ? 'var(--od-green)' : 'var(--od-red)' }}>
              {paceDelta >= 0 ? `${shortMoney(paceDelta)} ahead of pace` : `${shortMoney(Math.abs(paceDelta))} behind pace`}
            </b>
          </span>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
