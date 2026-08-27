'use client'

import { useMemo, useState } from 'react'

/**
 * Monthly performance chart for the AutoTrader Account-at-a-glance slide.
 *
 * All / PMax / DSA / Search filters. "All channels" draws stacked spend bars
 * (PMax / DSA / Search / Display). The overlay is either monthly CPA or
 * monthly conversions.
 *
 * CPA used to be a flat line on the per-channel views because conversions
 * were derived as spend / lifetime CPA — so every month inherited the same
 * number. That is gone. Every month now uses the actual primary (or all)
 * conversions from Campaign by month.csv, grouped the same way as the rest
 * of the audit (DSA split by campaign name, not campaign type).
 *
 * CPA basis: Primary = the conversions that feed bidding. All conversions =
 * reporting volume, 80% of which is secondary and dominated by Add to
 * Watchlist. Switching the basis does not change spend.
 */

type Channel = 'all' | 'pmax' | 'dsa' | 'search'
type View = 'cpa' | 'convs'
type CpaBasis = 'primary' | 'all'
type Slice = { s: number; v: number; a: number }
type ChannelMonth = { m: string; pmax: Slice; dsa: Slice; search: Slice; display: Slice }

const CHANNELS: ChannelMonth[] = [
  { m: '2024-01', pmax: {s:4859.04, v:435.3, a:458.1}, dsa: {s:4888.34, v:468.8, a:486.1}, search: {s:0, v:0, a:0}, display: {s:0, v:0, a:0} },
  { m: '2024-02', pmax: {s:5494.47, v:444.9, a:490.7}, dsa: {s:5153.39, v:410.4, a:441.1}, search: {s:0, v:0, a:0}, display: {s:0, v:0, a:0} },
  { m: '2024-03', pmax: {s:5251.54, v:303.7, a:1464.3}, dsa: {s:5241.77, v:214.9, a:704.0}, search: {s:0, v:0, a:0}, display: {s:0, v:0, a:0} },
  { m: '2024-04', pmax: {s:14561.18, v:1057.2, a:5090.0}, dsa: {s:14215.35, v:945.0, a:3916.8}, search: {s:0, v:0, a:0}, display: {s:0, v:0, a:0} },
  { m: '2024-05', pmax: {s:22084.04, v:1219.4, a:5477.0}, dsa: {s:16124.8, v:834.5, a:3599.4}, search: {s:59.33, v:2.0, a:17.2}, display: {s:0, v:0, a:0} },
  { m: '2024-06', pmax: {s:30758.85, v:1824.8, a:6092.4}, dsa: {s:20387.84, v:1084.0, a:3895.2}, search: {s:36.88, v:0, a:1.0}, display: {s:0, v:0, a:0} },
  { m: '2024-07', pmax: {s:30705.18, v:1951.6, a:6966.9}, dsa: {s:21102.69, v:1105.1, a:3683.2}, search: {s:49.38, v:7.0, a:12.8}, display: {s:0, v:0, a:0} },
  { m: '2024-08', pmax: {s:35338.12, v:1964.5, a:7149.2}, dsa: {s:18570.51, v:947.3, a:3096.4}, search: {s:70.35, v:8.6, a:31.4}, display: {s:0, v:0, a:0} },
  { m: '2024-09', pmax: {s:30635.64, v:1425.6, a:7420.1}, dsa: {s:16198.07, v:869.3, a:3116.5}, search: {s:1063.85, v:186.5, a:1251.9}, display: {s:0, v:0, a:0} },
  { m: '2024-10', pmax: {s:30473.77, v:1376.7, a:6431.3}, dsa: {s:22093.58, v:1040.0, a:4211.3}, search: {s:2496.94, v:293.5, a:1552.1}, display: {s:0, v:0, a:0} },
  { m: '2024-11', pmax: {s:46440.79, v:2382.3, a:10812.1}, dsa: {s:8192.0, v:407.3, a:1894.7}, search: {s:5338.77, v:405.2, a:3222.1}, display: {s:215.52, v:0, a:0} },
  { m: '2024-12', pmax: {s:46843.9, v:2304.6, a:16538.0}, dsa: {s:4178.05, v:228.5, a:1600.5}, search: {s:3031.85, v:247.2, a:2903.2}, display: {s:1200.54, v:1.0, a:11.0} },
  { m: '2025-01', pmax: {s:55578.33, v:3052.6, a:22374.1}, dsa: {s:9907.5, v:548.7, a:4191.5}, search: {s:1766.66, v:372.7, a:4444.8}, display: {s:985.95, v:0, a:4.8} },
  { m: '2025-02', pmax: {s:58647.54, v:3243.9, a:22440.0}, dsa: {s:9545.18, v:507.2, a:3844.8}, search: {s:4042.8, v:593.6, a:7786.4}, display: {s:302.91, v:0.4, a:43.7} },
  { m: '2025-03', pmax: {s:63416.88, v:3550.1, a:24636.7}, dsa: {s:12942.98, v:622.5, a:4685.2}, search: {s:4348.61, v:883.0, a:8452.1}, display: {s:302.42, v:0, a:70.4} },
  { m: '2025-04', pmax: {s:56972.44, v:3385.8, a:22548.3}, dsa: {s:15007.01, v:704.9, a:5250.6}, search: {s:4591.24, v:1083.6, a:7608.3}, display: {s:304.24, v:0, a:43.9} },
  { m: '2025-05', pmax: {s:57706.65, v:3615.6, a:20098.1}, dsa: {s:16429.41, v:796.9, a:4212.4}, search: {s:3860.37, v:1071.6, a:6132.5}, display: {s:301.31, v:0, a:111.6} },
  { m: '2025-06', pmax: {s:56943.02, v:2964.2, a:14684.6}, dsa: {s:23709.42, v:749.2, a:3669.9}, search: {s:3146.96, v:1177.8, a:6657.0}, display: {s:282.38, v:2.9, a:111.5} },
  { m: '2025-07', pmax: {s:54709.43, v:2955.7, a:14353.8}, dsa: {s:19202.92, v:717.2, a:3699.6}, search: {s:3452.08, v:1315.7, a:7178.1}, display: {s:303.1, v:0, a:74.2} },
  { m: '2025-08', pmax: {s:54714.94, v:2758.4, a:13915.5}, dsa: {s:19210.63, v:664.3, a:3274.0}, search: {s:3567.0, v:965.1, a:5894.8}, display: {s:304.4, v:3.0, a:51.5} },
  { m: '2025-09', pmax: {s:65122.69, v:2973.0, a:14628.7}, dsa: {s:7652.71, v:363.9, a:1798.9}, search: {s:3581.81, v:721.5, a:4910.3}, display: {s:304.43, v:0.3, a:32.3} },
  { m: '2025-10', pmax: {s:69649.62, v:3063.4, a:14687.9}, dsa: {s:19189.66, v:586.8, a:2743.1}, search: {s:3347.3, v:442.0, a:4196.6}, display: {s:304.19, v:0, a:26.5} },
  { m: '2025-11', pmax: {s:66009.31, v:3210.3, a:14616.9}, dsa: {s:12040.61, v:449.6, a:1833.5}, search: {s:3715.25, v:710.3, a:3886.4}, display: {s:302.98, v:0, a:21.6} },
  { m: '2025-12', pmax: {s:75988.64, v:3506.3, a:15442.6}, dsa: {s:12047.42, v:422.4, a:1767.3}, search: {s:4065.06, v:705.0, a:3713.6}, display: {s:304.21, v:0, a:24.9} },
  { m: '2026-01', pmax: {s:77512.11, v:3808.2, a:17089.4}, dsa: {s:15122.4, v:583.9, a:2843.2}, search: {s:4692.85, v:1017.4, a:4590.8}, display: {s:304.41, v:5.0, a:43.1} },
  { m: '2026-02', pmax: {s:71177.93, v:3418.2, a:15484.5}, dsa: {s:14698.57, v:593.1, a:2549.8}, search: {s:4708.26, v:839.1, a:4159.7}, display: {s:304.42, v:0, a:31.8} },
  { m: '2026-03', pmax: {s:66400.78, v:3884.7, a:16341.0}, dsa: {s:13227.28, v:536.1, a:2332.4}, search: {s:4474.28, v:894.7, a:4441.0}, display: {s:303.13, v:0, a:42.4} },
  { m: '2026-04', pmax: {s:60532.22, v:3028.9, a:12393.4}, dsa: {s:11525.96, v:437.6, a:1702.1}, search: {s:4168.88, v:681.8, a:3169.5}, display: {s:303.72, v:0, a:23.9} },
  { m: '2026-05', pmax: {s:66722.45, v:2601.0, a:10095.5}, dsa: {s:15528.35, v:416.0, a:1669.8}, search: {s:4834.76, v:681.5, a:2983.3}, display: {s:304.35, v:0, a:26.0} },
  { m: '2026-06', pmax: {s:48372.0, v:2280.3, a:9312.5}, dsa: {s:15599.11, v:524.7, a:2021.5}, search: {s:5499.88, v:559.1, a:2563.3}, display: {s:304.36, v:0, a:9.5} },
  { m: '2026-07', pmax: {s:50870.41, v:2271.1, a:9344.5}, dsa: {s:15810.07, v:422.5, a:1785.7}, search: {s:5782.37, v:820.2, a:3663.4}, display: {s:304.37, v:3.0, a:56.8} },
]

const STACK: { key: keyof Omit<ChannelMonth, 'm'>; label: string; fill: string }[] = [
  { key: 'pmax', label: 'PMax', fill: '#3b82f6' },
  { key: 'dsa', label: 'DSA', fill: '#06b6d4' },
  { key: 'search', label: 'Search', fill: '#8b5cf6' },
  { key: 'display', label: 'Display', fill: '#f43f5e' },
]

const CHANNEL_LABEL: Record<Channel, string> = {
  all: 'All channels',
  pmax: 'Performance Max',
  dsa: 'DSA',
  search: 'Search',
}

const W = 900
const H = 300
const PAD = { top: 16, right: 52, bottom: 34, left: 56 }

function fmtMonth(m: string) {
  const [y, mo] = m.split('-')
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mo) - 1]} ${y.slice(2)}`
}

function sliceOf(row: ChannelMonth, channel: Channel): Slice {
  if (channel === 'all') {
    return STACK.reduce(
      (acc, { key }) => ({ s: acc.s + row[key].s, v: acc.v + row[key].v, a: acc.a + row[key].a }),
      { s: 0, v: 0, a: 0 },
    )
  }
  return row[channel]
}

function convs(slice: Slice, basis: CpaBasis) {
  return basis === 'primary' ? slice.v : slice.a
}

export default function AccountGlanceChart() {
  const [channel, setChannel] = useState<Channel>('all')
  const [view, setView] = useState<View>('cpa')
  const [basis, setBasis] = useState<CpaBasis>('primary')

  const data = useMemo(
    () =>
      CHANNELS.map((row) => {
        const sl = sliceOf(row, channel)
        const v = convs(sl, basis)
        return { m: row.m, s: sl.s, v, cpa: v ? sl.s / v : 0, stack: row }
      }),
    [channel, basis],
  )

  const maxSpend = Math.max(...data.map((d) => d.s)) * 1.08
  const overlay = data.map((d) => (view === 'cpa' ? d.cpa : d.v))
  const overlayFinite = overlay.filter((v) => v > 0)
  const maxOverlay = (overlayFinite.length ? Math.max(...overlayFinite) : 1) * 1.15
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const barW = plotW / data.length
  const x = (i: number) => PAD.left + i * barW
  const yBar = (v: number) => PAD.top + plotH - (v / maxSpend) * plotH
  const yOv = (v: number) => PAD.top + plotH - (v / maxOverlay) * plotH

  const linePath = overlay
    .map((v, i) => {
      if (v <= 0) return null
      const cmd = overlay.findIndex((x) => x > 0) === i ? 'M' : 'L'
      return `${cmd} ${(x(i) + barW / 2).toFixed(1)} ${yOv(v).toFixed(1)}`
    })
    .filter(Boolean)
    .join(' ')

  const totalSpend = data.reduce((a, d) => a + d.s, 0)
  const totalConv = data.reduce((a, d) => a + d.v, 0)

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {(['all', 'pmax', 'dsa', 'search'] as Channel[]).map((c) => (
            <button
              key={c}
              onClick={() => setChannel(c)}
              className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
                channel === c ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {CHANNEL_LABEL[c]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {(['cpa', 'convs'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  view === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {v === 'cpa' ? 'CPA' : 'Conversions'}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {(['primary', 'all'] as CpaBasis[]).map((b) => (
              <button
                key={b}
                onClick={() => setBasis(b)}
                className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  basis === b ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {b === 'primary' ? 'Primary CPA' : 'All-conv CPA'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Monthly spend and ${view === 'cpa' ? `${basis} cost per conversion` : `${basis} conversions`} for ${CHANNEL_LABEL[channel]}, January 2024 to July 2026`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const yy = PAD.top + plotH - t * plotH
          return (
            <g key={t}>
              <line x1={PAD.left} y1={yy} x2={W - PAD.right} y2={yy} stroke="#e2e8f0" strokeWidth="1" />
              <text x={PAD.left - 8} y={yy + 3} textAnchor="end" className="fill-slate-400" style={{ fontSize: 9 }}>
                {(maxSpend * t / 1000).toFixed(0)}k
              </text>
            </g>
          )
        })}
        {[0, 0.5, 1].map((t) => {
          const yy = PAD.top + plotH - t * plotH
          return (
            <text key={t} x={W - PAD.right + 8} y={yy + 3} className="fill-slate-400" style={{ fontSize: 9 }}>
              {view === 'cpa' ? `$${(maxOverlay * t).toFixed(0)}` : (maxOverlay * t).toFixed(0)}
            </text>
          )
        })}

        {data.map((d, i) => {
          if (channel === 'all') {
            let yCursor = PAD.top + plotH
            return (
              <g key={d.m}>
                {STACK.map(({ key, fill, label }) => {
                  const val = d.stack[key].s
                  if (val <= 0) return null
                  const h = (val / maxSpend) * plotH
                  yCursor -= h
                  return (
                    <rect key={key} x={x(i) + barW * 0.15} y={yCursor} width={barW * 0.7} height={h} fill={fill} opacity="0.85">
                      <title>{`${fmtMonth(d.m)} — ${label} $${val.toLocaleString('en-NZ', { maximumFractionDigits: 0 })}`}</title>
                    </rect>
                  )
                })}
              </g>
            )
          }
          const yy = yBar(d.s)
          return (
            <rect
              key={d.m}
              x={x(i) + barW * 0.15}
              y={yy}
              width={barW * 0.7}
              height={PAD.top + plotH - yy}
              rx="1.5"
              className="fill-blue-500/70"
            >
              <title>
                {`${fmtMonth(d.m)} — spend $${d.s.toLocaleString('en-NZ', { maximumFractionDigits: 0 })}, ${
                  view === 'cpa' ? `CPA $${d.cpa.toFixed(2)}` : `${d.v.toFixed(0)} conversions`
                }`}
              </title>
            </rect>
          )
        })}

        <path d={linePath} fill="none" stroke="rgb(217,119,6)" strokeWidth="2" strokeLinejoin="round" />
        {overlay.map((v, i) =>
          v > 0 ? <circle key={data[i].m} cx={x(i) + barW / 2} cy={yOv(v)} r="2" className="fill-amber-600" /> : null,
        )}

        {data.map((d, i) =>
          i % 3 === 0 ? (
            <text key={d.m} x={x(i) + barW / 2} y={H - 12} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 8.5 }}>
              {fmtMonth(d.m)}
            </text>
          ) : null,
        )}
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
          {channel === 'all' ? (
            STACK.map(({ key, label, fill }) => (
              <span key={key} className="inline-flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm" style={{ background: fill }} /> {label}
              </span>
            ))
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-sm bg-blue-500/70" /> Spend (NZD, left)
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-amber-600" />{' '}
            {view === 'cpa'
              ? `${basis === 'primary' ? 'Primary' : 'All-conv'} CPA (right)`
              : `${basis === 'primary' ? 'Primary' : 'All'} conversions (right)`}
          </span>
        </div>
        <div className="text-[11px] text-slate-500 tabular-nums">
          {CHANNEL_LABEL[channel]}: ${totalSpend.toLocaleString('en-NZ', { maximumFractionDigits: 0 })} ·{' '}
          {totalConv.toLocaleString('en-NZ', { maximumFractionDigits: 0 })} conv · CPA $
          {totalConv ? (totalSpend / totalConv).toFixed(2) : '—'}
        </div>
      </div>

      <p className="text-[10.5px] text-slate-400 mt-1.5 leading-snug">
        Spend is exact. <strong>Primary CPA</strong> uses the conversions that feed bidding.{' '}
        <strong>All-conv CPA</strong> uses reported volume — 80% of which is secondary and dominated by Add to
        Watchlist, so it will look roughly five times cheaper. Display is in the stack (1% of spend) but has no
        filter of its own.
      </p>
    </div>
  )
}
