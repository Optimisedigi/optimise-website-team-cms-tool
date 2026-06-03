import React from 'react'
import { Shell } from '../_components/Shell'
import { Stat, LegendItem } from '../_components/widgets'
import {
  DASH_KPIS,
  GSC_STATS,
  GSC_BARS,
  INVOICE_ROWS,
  GA4_STATS,
  GA4_CHANNELS,
  FUNNEL,
  LEAD_CHANNELS,
  DRIP,
} from '../_data/mock'

export default function DashboardPreview(): React.ReactElement {
  return (
    <Shell activeKey="dashboard" crumbs={[{ label: 'Dashboard', strong: true }]}>
      <div className="page-head">
        <div>
          <h1>Good morning, Peter</h1>
          <div className="sub">Agency overview · June 2026</div>
        </div>
        <div className="spacer" />
        <button className="btn primary">＋ New Client</button>
      </div>

      {/* Topline agency data — 8 KPI tiles */}
      <div className="kpis g-8">
        {DASH_KPIS.map((kpi) => (
          <div className="kpi" key={kpi.label}>
            <div className="lbl">
              {kpi.dot ? <span className="dot" style={{ background: kpi.dot }} /> : null}
              {kpi.label}
            </div>
            <div className="val">{kpi.value}</div>
            <div className={`delta ${kpi.trend}`}>{kpi.delta}</div>
          </div>
        ))}
      </div>

      {/* Yearly Sales Target */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-b" style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <b style={{ fontSize: 13 }}>Yearly Sales Target</b>
            <span className="t-muted" style={{ fontSize: 12 }}>
              $284k of $400k · <b style={{ color: 'var(--green)' }}>71%</b> ·{' '}
              <b style={{ color: 'var(--t2)' }}>183 days remaining</b>
            </span>
          </div>
          <div style={{ position: 'relative', height: 10, borderRadius: 20, background: '#eef0f3', overflow: 'visible' }}>
            <div
              style={{ width: '71%', height: '100%', borderRadius: 20, background: 'linear-gradient(90deg,var(--teal),var(--teal-light))' }}
            />
            <div
              title="Expected pace"
              style={{ position: 'absolute', top: -3, left: '50%', width: 2, height: 16, background: 'var(--accent)', borderRadius: 2 }}
            />
          </div>
          <div style={{ marginTop: 8, fontSize: 11.5 }}>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Expected to date: $200k</span>{' '}
            <span className="t-muted">
              · <b style={{ color: 'var(--green)' }}>$84k ahead of pace</b>
            </span>
          </div>
        </div>
      </div>

      {/* Main grid: left content + right rail */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 360px', marginTop: 16, alignItems: 'start' }}>
        {/* LEFT COLUMN */}
        <div className="grid">
          {/* GSC */}
          <div className="card">
            <div className="card-h">
              <div className="eyebrow">Search</div>
              <h3>Google Search Console</h3>
              <div className="spacer" />
              <button className="btn sm">↻ Refresh</button>
              <button className="btn sm">⟳ Re-seed</button>
            </div>
            <div className="card-b">
              <div className="grid" style={{ gridTemplateColumns: 'repeat(6,1fr)', gap: 14, marginBottom: 16 }}>
                {GSC_STATS.map((s) => (
                  <Stat key={s.k} k={s.k} v={s.v} d={s.d} trend={s.trend} />
                ))}
              </div>
              <div className="bars">
                {GSC_BARS.map((b, i) => (
                  <div key={i} className={`b${b.dk ? ' dk' : ''}`} style={{ height: `${b.h}%` }} />
                ))}
              </div>
              <div className="legend">
                <LegendItem color="var(--teal-light)">Clicks (bars)</LegendItem>
                <LegendItem color="var(--violet)">Impressions (line)</LegendItem>
              </div>
            </div>
          </div>

          {/* Costs */}
          <div className="card">
            <div className="card-h">
              <div className="eyebrow">Finance</div>
              <h3>Costs — June</h3>
              <div className="spacer" />
              <button className="btn sm">Hide details ⌃</button>
            </div>
            <div className="card-b">
              <div className="grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', marginBottom: 14 }}>
                <Stat k="Total" v="$8.2k" />
                <Stat k="Business" v="$3.1k" swatch="var(--amber)" />
                <Stat k="Infra" v="$1.1k" swatch="var(--teal-dark)" />
                <Stat k="API" v="$2.4k" swatch="var(--teal)" />
                <Stat k="LLM" v="$1.6k" swatch="var(--teal-light)" />
              </div>
              <div className="stackbar">
                <span style={{ width: '38%', background: 'var(--amber)' }} />
                <span style={{ width: '13%', background: 'var(--teal-dark)' }} />
                <span style={{ width: '29%', background: 'var(--teal)' }} />
                <span style={{ width: '20%', background: 'var(--teal-light)' }} />
              </div>
              <div className="grid g-4" style={{ marginTop: 18, gap: 14 }}>
                <div>
                  <div className="subhead" style={{ marginBottom: 8 }}>
                    <h4>Business</h4>
                  </div>
                  <div className="t-muted" style={{ fontSize: 12, lineHeight: 1.9 }}>
                    Software $1.4k
                    <br />
                    Subscriptions $0.9k
                    <br />
                    Contractors $0.8k
                  </div>
                </div>
                <div>
                  <div className="subhead" style={{ marginBottom: 8 }}>
                    <h4>Infrastructure</h4>
                  </div>
                  <div className="t-muted" style={{ fontSize: 12, lineHeight: 1.9 }}>
                    Vercel $0.4k
                    <br />
                    Turso $0.3k
                    <br />
                    Railway $0.4k
                  </div>
                </div>
                <div>
                  <div className="subhead" style={{ marginBottom: 8 }}>
                    <h4>API</h4>
                  </div>
                  <div className="t-muted" style={{ fontSize: 12, lineHeight: 1.9 }}>
                    Growth Tools $1.2k
                    <br />
                    Scrapling $0.6k
                    <br />
                    GSC/GA $0.6k
                  </div>
                </div>
                <div>
                  <div className="subhead" style={{ marginBottom: 8 }}>
                    <h4>LLM</h4>
                  </div>
                  <div className="t-muted" style={{ fontSize: 12, lineHeight: 1.9 }}>
                    Gemini $0.9k
                    <br />
                    Claude $0.5k
                    <br />
                    Other $0.2k
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Business Costs */}
          <div className="card">
            <div className="card-h">
              <div className="eyebrow">Finance</div>
              <h3>Business Costs</h3>
              <div className="spacer" />
              <button className="btn sm">Categorise →</button>
            </div>
            <div className="card-b">
              <div className="grid g-2">
                <Stat k="Total This Month" v="$3,140" d="▲ 5% vs May" trend="up" />
                <Stat k="Uncategorised" v="6" vColor="var(--amber)" d={<span style={{ color: 'var(--amber)' }}>⚠ Needs review</span>} />
              </div>
            </div>
          </div>

          {/* Outstanding Invoices */}
          <div className="card">
            <div className="card-h">
              <div className="eyebrow">Finance</div>
              <h3>Outstanding Invoices &amp; Scheduled Sends</h3>
              <div className="spacer" />
              <button className="btn sm">↻ Refresh</button>
            </div>
            <div className="card-b" style={{ paddingBottom: 6 }}>
              <div className="grid g-3" style={{ marginBottom: 6 }}>
                <Stat k="Outstanding" v="$16.6k" d="▼ 4 invoices" trend="down" />
                <Stat k="Overdue" v="$7.0k" vColor="var(--red)" d="3 invoices" trend="down" />
                <Stat k="Scheduled" v="$3.1k" d="1 send" trend="flat" />
              </div>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Invoice</th>
                  <th>Status</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {INVOICE_ROWS.map((r) => (
                  <tr key={r.inv}>
                    <td className="t-strong">{r.client}</td>
                    <td className="t-muted">{r.inv}</td>
                    <td>
                      <span className={`pill ${r.statusVariant}`}>{r.status}</span>
                    </td>
                    <td className="num t-strong">{r.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT RAIL */}
        <div className="grid">
          {/* Pending Statements */}
          <div className="card" style={{ borderColor: '#f5dcae', background: '#fffaf2' }}>
            <div className="card-b" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px' }}>
              <div className="feed-dot" style={{ background: '#fdf0e3', width: 40, height: 40, flex: '0 0 40px', fontSize: 18 }}>
                📥
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>3 Pending Statements</div>
                <div className="t-muted" style={{ fontSize: 12 }}>
                  Clients with ≥2 outstanding invoices
                </div>
              </div>
              <button className="btn sm primary">Review</button>
            </div>
          </div>

          {/* Activity Feed */}
          <div className="card">
            <div className="card-h">
              <h3>Activity</h3>
              <div className="spacer" />
              <span className="t-muted" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
                See all
              </span>
            </div>
            <div className="card-b" style={{ paddingTop: 6, paddingBottom: 6 }}>
              <div className="feed-item">
                <div className="feed-dot" style={{ background: '#e8f6ee' }}>
                  ✅
                </div>
                <div className="txt">
                  <b>OptiMate</b> approved 14 negative keywords for <b>Acme Corp</b>
                  <div className="meta">Peter · Google Ads · 18m ago</div>
                </div>
              </div>
              <div className="feed-item">
                <div className="feed-dot" style={{ background: '#e6f4fb' }}>
                  📄
                </div>
                <div className="txt">
                  Proposal sent to <b>Lumen Co</b>
                  <div className="meta">Sarah · Proposals · 1h ago</div>
                </div>
              </div>
              <div className="feed-item">
                <div className="feed-dot" style={{ background: '#fdf0e3' }}>
                  💰
                </div>
                <div className="txt">
                  Invoice <b>INV-0231</b> marked overdue
                  <div className="meta">System · Finance · 2h ago</div>
                </div>
              </div>
              <div className="feed-item">
                <div className="feed-dot" style={{ background: '#f0eefe' }}>
                  🤖
                </div>
                <div className="txt">
                  <b>5 agent actions</b> awaiting review
                  <div className="meta">OptiMate · Agent · 3h ago</div>
                </div>
              </div>
              <div className="feed-item">
                <div className="feed-dot" style={{ background: '#e8f6ee' }}>
                  🚢
                </div>
                <div className="txt">
                  Deployment <b>v2.14</b> succeeded
                  <div className="meta">Vercel · 4h ago</div>
                </div>
              </div>
              <div className="feed-item">
                <div className="feed-dot" style={{ background: '#e6f4fb' }}>
                  📊
                </div>
                <div className="txt">
                  GA4 snapshot synced for <b>Northwind</b>
                  <div className="meta">System · Analytics · 5h ago</div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Items */}
          <div className="card">
            <div className="card-h">
              <h3>Action Items</h3>
              <div className="spacer" />
              <span className="pill amber">8</span>
            </div>
            <div className="card-b" style={{ paddingTop: 8 }}>
              <div className="toggle-row">
                <div className="info">
                  <b>Review OptiMate approvals</b>
                  <small>5 pending · Google Ads</small>
                </div>
                <span className="pill blue">Open</span>
              </div>
              <div className="toggle-row">
                <div className="info">
                  <b>Send 3 invoice statements</b>
                  <small>≥2 outstanding invoices</small>
                </div>
                <span className="pill amber">Due</span>
              </div>
              <div className="toggle-row">
                <div className="info">
                  <b>Categorise 6 business costs</b>
                  <small>Uncategorised this month</small>
                </div>
                <span className="pill gray">Later</span>
              </div>
              <div className="toggle-row">
                <div className="info">
                  <b>Brightline health at risk</b>
                  <small>CTR dropped 18% WoW</small>
                </div>
                <span className="pill red">Urgent</span>
              </div>
            </div>
          </div>

          {/* Client Processes */}
          <div className="card">
            <div className="card-h">
              <h3>Client Processes</h3>
            </div>
            <div className="card-b" style={{ paddingTop: 10 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <span className="pill green">12 On track</span>
                <span className="pill amber">3 At risk</span>
                <span className="pill gray">2 Done</span>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                  <b>Acme Corp — Onboarding</b>
                  <span className="t-muted">62%</span>
                </div>
                <div className="mini-prog">
                  <span style={{ width: '62%' }} />
                </div>
                <div className="t-muted" style={{ fontSize: 11, marginTop: 4 }}>
                  Phase 2 of 4
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                  <b>Brightline — GA4 Setup</b>
                  <span className="t-muted">28%</span>
                </div>
                <div className="mini-prog">
                  <span style={{ width: '28%' }} />
                </div>
                <div className="t-muted" style={{ fontSize: 11, marginTop: 4 }}>
                  Phase 1 of 3
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* GA4 band */}
      <div className="band-h">
        <div className="eyebrow">Analytics</div>
        <h2>Google Analytics (GA4)</h2>
        <div className="spacer" />
        <div className="seg">
          <button>30d</button>
          <button>90d</button>
          <button className="active">12m</button>
        </div>
      </div>

      <div className="card">
        <div className="card-b">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(6,1fr)', gap: 14, marginBottom: 18 }}>
            {GA4_STATS.map((s) => (
              <Stat key={s.k} k={s.k} v={s.v} d={s.d} trend={s.trend} />
            ))}
          </div>

          <svg className="linechart" viewBox="0 0 900 170" preserveAspectRatio="none">
            <defs>
              <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#74B3A8" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#74B3A8" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" y1="40" x2="900" y2="40" stroke="#eef0f3" />
            <line x1="0" y1="85" x2="900" y2="85" stroke="#eef0f3" />
            <line x1="0" y1="130" x2="900" y2="130" stroke="#eef0f3" />
            <path
              d="M0,120 C80,110 120,70 200,75 C280,80 320,40 400,55 C480,68 520,30 600,45 C680,58 720,25 800,35 L900,30 L900,170 L0,170 Z"
              fill="url(#fill)"
            />
            <path
              d="M0,120 C80,110 120,70 200,75 C280,80 320,40 400,55 C480,68 520,30 600,45 C680,58 720,25 800,35 L900,30"
              fill="none"
              stroke="#468D8B"
              strokeWidth="2.5"
            />
            <path
              d="M0,140 C80,135 120,115 200,120 C280,125 320,100 400,108 C480,116 520,95 600,100 C680,105 720,88 800,95 L900,92"
              fill="none"
              stroke="#6366f1"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          </svg>
          <div className="legend">
            <LegendItem color="var(--teal)">Users</LegendItem>
            <LegendItem color="var(--violet)">Sessions</LegendItem>
            <LegendItem color="var(--teal-light)">Pageviews</LegendItem>
          </div>
        </div>

        <div className="subhead" style={{ padding: '0 18px', margin: '8px 0 0' }}>
          <h4>Channel Grouping</h4>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Channel</th>
              <th className="num">Sessions</th>
              <th className="num">Users</th>
              <th className="num">New Users</th>
              <th className="num">Bounce</th>
              <th className="num">Avg Dur.</th>
              <th className="num">Key Events</th>
            </tr>
          </thead>
          <tbody>
            {GA4_CHANNELS.map((c) => (
              <tr key={c.ch}>
                <td className="t-strong">{c.ch}</td>
                <td className="num">{c.sessions}</td>
                <td className="num">{c.users}</td>
                <td className="num">{c.newUsers}</td>
                <td className="num">{c.bounce}</td>
                <td className="num">{c.dur}</td>
                <td className="num t-strong">{c.events}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sales Funnel band */}
      <div className="band-h">
        <div className="eyebrow">Pipeline</div>
        <h2>Sales Funnel</h2>
        <div className="spacer" />
        <span className="t-muted" style={{ fontSize: 12 }}>
          Lead → Client · last 90 days
        </span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr', alignItems: 'stretch' }}>
        <div className="card">
          <div className="card-b">
            <div className="funnel">
              {FUNNEL.map((step) => (
                <div className="step" key={step.label}>
                  <div className="bar" style={{ width: `${step.width}%`, background: step.bg }}>
                    {step.label}
                  </div>
                  <div className="meta">
                    <b>{step.count}</b> · {step.pct}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-h">
            <h3>Conversion</h3>
          </div>
          <div className="card-b" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div className="donut" style={{ background: 'conic-gradient(var(--teal) 0% 31%, #eef0f3 31% 100%)' }}>
              <div className="hole">
                <b>31%</b>
                <small>WIN RATE</small>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="toggle-row">
                <div className="info">
                  <b>Lead → Qualified</b>
                </div>
                <span className="t-muted">74%</span>
              </div>
              <div className="toggle-row">
                <div className="info">
                  <b>Qualified → Proposal</b>
                </div>
                <span className="t-muted">72%</span>
              </div>
              <div className="toggle-row">
                <div className="info">
                  <b>Proposal → Won</b>
                </div>
                <span className="t-muted">58%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lead Channel Performance */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-h">
          <div className="eyebrow">Pipeline</div>
          <h3>Lead Channel Performance</h3>
          <div className="spacer" />
          <span className="t-muted" style={{ fontSize: 12 }}>
            Lead source → client · last 90 days
          </span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Channel</th>
              <th className="num">Leads</th>
              <th className="num">Qualified</th>
              <th className="num">Proposals</th>
              <th className="num">Won</th>
              <th className="num">Win Rate</th>
              <th className="num">Avg Deal</th>
              <th className="num">Pipeline Value</th>
            </tr>
          </thead>
          <tbody>
            {LEAD_CHANNELS.map((c) => (
              <tr key={c.ch}>
                <td className="t-strong">{c.ch}</td>
                <td className="num">{c.leads}</td>
                <td className="num">{c.qualified}</td>
                <td className="num">{c.proposals}</td>
                <td className="num t-strong">{c.won}</td>
                <td className="num">
                  <span className={`pill ${c.rateVariant}`}>{c.rate}</span>
                </td>
                <td className="num">{c.avg}</td>
                <td className="num t-strong">{c.pipeline}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Drip Email Tracker band */}
      <div className="band-h">
        <div className="eyebrow">Lifecycle</div>
        <h2>Drip Email Tracker</h2>
        <div className="spacer" />
        <span className="t-muted" style={{ fontSize: 12 }}>
          Prospect nurture sequence
        </span>
      </div>

      <div className="card">
        <div className="card-b">
          <div className="drip">
            {DRIP.map((node) => (
              <div className={`node${node.state ? ` ${node.state}` : ''}`} key={node.label}>
                <div className="dotn">{node.icon}</div>
                <div className="nlabel">{node.label}</div>
                <div className="nstat">{node.stat}</div>
              </div>
            ))}
          </div>
          <div className="grid g-4" style={{ marginTop: 22, gap: 14 }}>
            <Stat k="Active in Sequence" v="98" />
            <Stat k="Avg Open Rate" v="56%" d="▲ 3%" trend="up" />
            <Stat k="Reply Rate" v="9.4%" d="▲ 1.1%" trend="up" />
            <Stat k="Booked Calls" v="14" d="▲ 4" trend="up" />
          </div>
        </div>
      </div>
    </Shell>
  )
}
