'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Monthly performance chart for the Account-at-a-glance slide.
 * - 16 monthly bars (Spend, AUD)
 * - Clicks line (left axis)
 * - Conversions OR CPL overlay (right axis)
 * - Geo toggle: All / AU / US
 * - View toggle: Conversions vs CPL
 *
 * Real data from scripts/audit-away-digital/data/02_monthly_by_campaign.json,
 * bucketed by AU/US via campaign-name suffix; legacy "ADT Traffic" → AU.
 *
 * Lifted from the source HTML inline script and ported to React. The chart
 * itself is still drawn imperatively into an inline <g id="chart-data" />
 * (cheaper than re-keying ~150 SVG nodes through React for a static dataset).
 */

export type Row = { m: string; s: number; c: number; v: number }
type Geo = 'all' | 'AU' | 'US'
type View = 'cpa' | 'convs'

const CHART_SERIES: Record<Geo, Row[]> = {
  all: [
    { m: '2025-01', s: 9887, c: 2305, v: 1263.4 },
    { m: '2025-02', s: 19694, c: 2863, v: 1828.5 },
    { m: '2025-03', s: 29310, c: 6624, v: 5066.1 },
    { m: '2025-04', s: 27318, c: 7910, v: 5970.9 },
    { m: '2025-05', s: 25163, c: 1349, v: 0 },
    { m: '2025-06', s: 25789, c: 1423, v: 15 },
    { m: '2025-07', s: 29984, c: 2585, v: 20 },
    { m: '2025-08', s: 34829, c: 2690, v: 34 },
    { m: '2025-09', s: 40664, c: 3535, v: 29 },
    { m: '2025-10', s: 55543, c: 3458, v: 56 },
    { m: '2025-11', s: 57045, c: 3986, v: 29 },
    { m: '2025-12', s: 25529, c: 2191, v: 25 },
    { m: '2026-01', s: 40801, c: 2701, v: 40 },
    { m: '2026-02', s: 59558, c: 3061, v: 30 },
    { m: '2026-03', s: 50667, c: 2944, v: 28 },
    { m: '2026-04', s: 42390, c: 1742, v: 31 },
  ],
  AU: [
    { m: '2025-01', s: 9887, c: 2305, v: 1263.4 },
    { m: '2025-02', s: 19694, c: 2863, v: 1828.5 },
    { m: '2025-03', s: 29310, c: 6624, v: 5066.1 },
    { m: '2025-04', s: 27318, c: 7910, v: 5970.9 },
    { m: '2025-05', s: 25163, c: 1349, v: 0 },
    { m: '2025-06', s: 25789, c: 1423, v: 15 },
    { m: '2025-07', s: 29984, c: 2585, v: 20 },
    { m: '2025-08', s: 29888, c: 2455, v: 34 },
    { m: '2025-09', s: 29862, c: 2158, v: 23 },
    { m: '2025-10', s: 34382, c: 2362, v: 24 },
    { m: '2025-11', s: 34933, c: 2812, v: 23 },
    { m: '2025-12', s: 15146, c: 1683, v: 11 },
    { m: '2026-01', s: 19585, c: 1218, v: 14 },
    { m: '2026-02', s: 29334, c: 1322, v: 21 },
    { m: '2026-03', s: 25758, c: 1668, v: 10 },
    { m: '2026-04', s: 21793, c: 998, v: 18 },
  ],
  US: [
    { m: '2025-01', s: 0, c: 0, v: 0 },
    { m: '2025-02', s: 0, c: 0, v: 0 },
    { m: '2025-03', s: 0, c: 0, v: 0 },
    { m: '2025-04', s: 0, c: 0, v: 0 },
    { m: '2025-05', s: 0, c: 0, v: 0 },
    { m: '2025-06', s: 0, c: 0, v: 0 },
    { m: '2025-07', s: 0, c: 0, v: 0 },
    { m: '2025-08', s: 4941, c: 235, v: 0 },
    { m: '2025-09', s: 10803, c: 1377, v: 6 },
    { m: '2025-10', s: 21161, c: 1096, v: 32 },
    { m: '2025-11', s: 22112, c: 1174, v: 6 },
    { m: '2025-12', s: 10383, c: 508, v: 14 },
    { m: '2026-01', s: 21216, c: 1483, v: 26 },
    { m: '2026-02', s: 30223, c: 1739, v: 9 },
    { m: '2026-03', s: 24908, c: 1276, v: 18 },
    { m: '2026-04', s: 20598, c: 744, v: 13 },
  ],
}

const G = {
  xL: 100,
  xR: 820,
  yTop: 30,
  yBot: 300,
  spendMax: 60000,
  clicksMax: 8000,
  convMax: 60,
  cpaMax: 2000,
  xs: [
    122.5, 167.5, 212.5, 257.5, 302.5, 347.5, 392.5, 437.5, 482.5, 527.5, 572.5, 617.5, 662.5,
    707.5, 752.5, 797.5,
  ],
  barW: 27.9,
}

const SVG_NS = 'http://www.w3.org/2000/svg'

function scaleY(v: number, max: number): number {
  return G.yBot - (v / max) * (G.yBot - G.yTop)
}

function fmtSpend(v: number): string {
  if (v <= 0) return ''
  if (v < 100000) return '$' + (v / 1000).toFixed(1) + 'K'
  return '$' + Math.round(v / 1000) + 'K'
}

function fmtNum(v: number): string {
  return v.toLocaleString()
}

function makeEl(tag: string, attrs: Record<string, string>, text?: string): SVGElement {
  const n = document.createElementNS(SVG_NS, tag) as SVGElement
  for (const k in attrs) n.setAttribute(k, attrs[k])
  if (text != null) n.textContent = text
  return n
}

function addTitle(parent: SVGElement, txt: string) {
  const t = document.createElementNS(SVG_NS, 'title')
  t.textContent = txt
  parent.appendChild(t)
}

export default function AccountGlanceChart({
  rows,
  clientName = 'Custom Fluid Power',
  periodLabel = '16 months',
  geoAvailable = true,
}: {
  rows?: Row[]
  clientName?: string
  periodLabel?: string
  geoAvailable?: boolean
}) {
  const chartSeries = useMemo<Record<Geo, Row[]>>(
    () => ({
      all: rows ?? CHART_SERIES.all,
      AU: rows ?? CHART_SERIES.AU,
      US: rows ? rows.map((row) => ({ ...row, s: 0, c: 0, v: 0 })) : CHART_SERIES.US,
    }),
    [rows],
  )
  const spendMax = rows ? Math.max(1, ...chartSeries.all.map((row) => row.s)) * 1.15 : G.spendMax
  const clicksMax = rows ? Math.max(1, ...chartSeries.all.map((row) => row.c)) * 1.15 : G.clicksMax
  const convMax = rows ? Math.max(1, ...chartSeries.all.map((row) => row.v)) * 1.15 : G.convMax
  const cpaMax = rows
    ? Math.max(1, ...chartSeries.all.map((row) => (row.v > 0 ? row.s / row.v : 0))) * 1.15
    : G.cpaMax
  const [geo, setGeo] = useState<Geo>('all')
  const [view, setView] = useState<View>('cpa')
  const dataGroupRef = useRef<SVGGElement | null>(null)

  const cplCard = useMemo(() => {
    const series = chartSeries[geo]
    let s = 0
    let v = 0
    for (let i = 0; i < series.length; i++) {
      s += series[i].s
      v += series[i].v
    }
    const cpl = v > 0 ? Math.round(s / v) : 0
    const labelMap: Record<Geo, string> = { all: 'Account', AU: 'AU', US: 'US' }
    return {
      label: labelMap[geo],
      value: cpl > 0 ? '~$' + cpl.toLocaleString() : '-',
    }
  }, [chartSeries, geo])

  useEffect(() => {
    const root = dataGroupRef.current
    if (!root) return
    while (root.firstChild) root.removeChild(root.firstChild)

    const data = chartSeries[geo]

    // Bars + spend labels
    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      if (d.s <= 0) continue
      const x = G.xs[i]
      const h = (d.s / spendMax) * (G.yBot - G.yTop)
      const y = G.yBot - h
      const rect = makeEl('rect', {
        x: (x - G.barW / 2).toFixed(1),
        y: y.toFixed(1),
        width: G.barW.toFixed(1),
        height: h.toFixed(1),
        fill: 'rgb(37,99,235)',
        opacity: '0.75',
        rx: '1',
      })
      addTitle(rect, d.m + ': $' + Math.round(d.s).toLocaleString())
      root.appendChild(rect)
      const lbl = makeEl(
        'text',
        {
          x: x.toFixed(1),
          y: (y - 4).toFixed(1),
          'text-anchor': 'middle',
          'font-size': '8',
          fill: 'rgb(30,58,138)',
          'font-weight': '700',
        },
        fmtSpend(d.s),
      )
      root.appendChild(lbl)
    }

    // Clicks line + dots
    let clickPts: string[] = []
    if (geo === 'US') {
      clickPts = data
        .map((d, k) =>
          d.c > 0 ? G.xs[k].toFixed(1) + ',' + scaleY(d.c, clicksMax).toFixed(1) : null,
        )
        .filter((p): p is string => p !== null)
    } else {
      for (let j = 0; j < data.length; j++) {
        clickPts.push(G.xs[j].toFixed(1) + ',' + scaleY(data[j].c, clicksMax).toFixed(1))
      }
    }
    if (clickPts.length > 1) {
      root.appendChild(
        makeEl('polyline', {
          points: clickPts.join(' '),
          fill: 'none',
          stroke: 'rgb(5,150,105)',
          'stroke-width': '2',
          'stroke-linejoin': 'round',
        }),
      )
    }
    for (let k = 0; k < data.length; k++) {
      const dk = data[k]
      if (geo === 'US' && dk.c <= 0) continue
      const cy = scaleY(dk.c, clicksMax)
      const dot = makeEl('circle', {
        cx: G.xs[k].toFixed(1),
        cy: cy.toFixed(1),
        r: '2.75',
        fill: 'rgb(5,150,105)',
      })
      addTitle(dot, dk.m + ': ' + fmtNum(dk.c) + ' clicks')
      root.appendChild(dot)
    }

    // Conversions OR CPL overlay (right axis) across the supplied period
    if (view === 'convs') {
      let convPts: string[] = []
      if (geo === 'US') {
        for (let p2 = 0; p2 < data.length; p2++) {
          if (data[p2].v > 0)
            convPts.push(G.xs[p2].toFixed(1) + ',' + scaleY(data[p2].v, convMax).toFixed(1))
        }
      } else {
        for (let p = 0; p < data.length; p++) {
          convPts.push(G.xs[p].toFixed(1) + ',' + scaleY(data[p].v, convMax).toFixed(1))
        }
      }
      if (convPts.length > 1) {
        root.appendChild(
          makeEl('polyline', {
            points: convPts.join(' '),
            fill: 'none',
            stroke: 'rgb(234,88,12)',
            'stroke-width': '2',
            'stroke-dasharray': '4,2',
            'stroke-linejoin': 'round',
          }),
        )
      }
      for (let q = 0; q < data.length; q++) {
        const dq = data[q]
        if (geo === 'US' && dq.v <= 0) continue
        const cyv = scaleY(dq.v, convMax)
        const dotv = makeEl('circle', {
          cx: G.xs[q].toFixed(1),
          cy: cyv.toFixed(1),
          r: '2.75',
          fill: 'rgb(234,88,12)',
        })
        addTitle(dotv, dq.m + ': ' + Math.round(dq.v) + ' conversions')
        root.appendChild(dotv)
        const clicksY = scaleY(dq.c, clicksMax)
        let lblY = cyv - 6
        if (Math.abs(lblY - clicksY) < 9 || Math.abs(lblY - (clicksY - 4)) < 9) {
          lblY = Math.min(clicksY, cyv) - 12
        }
        root.appendChild(
          makeEl(
            'text',
            {
              x: G.xs[q].toFixed(1),
              y: lblY.toFixed(1),
              'text-anchor': 'middle',
              'font-size': '8',
              fill: 'rgb(194,65,12)',
              'font-weight': '700',
            },
            Math.round(dq.v).toString(),
          ),
        )
      }
    } else {
      // CPL: spend / conversions across the supplied period, only where v > 0
      type CpaItem = { x: number; cpa: number; m: string; s: number }
      const cpaItems: CpaItem[] = []
      for (let r = 0; r < data.length; r++) {
        const dr = data[r]
        if (dr.v > 0) cpaItems.push({ x: G.xs[r], cpa: dr.s / dr.v, m: dr.m, s: dr.s })
      }
      // Clamp Y to chart top so off-scale values stay visible at the ceiling
      const cpaY = (cpa: number) => Math.max(G.yTop, scaleY(cpa, cpaMax))

      if (cpaItems.length > 1) {
        root.appendChild(
          makeEl('polyline', {
            points: cpaItems.map((it) => it.x.toFixed(1) + ',' + cpaY(it.cpa).toFixed(1)).join(' '),
            fill: 'none',
            stroke: 'rgb(139,92,246)',
            'stroke-width': '2',
            'stroke-dasharray': '4,2',
            'stroke-linejoin': 'round',
          }),
        )
      }

      // Build index from x -> clicks Y and spend-label Y for collision detection
      const clicksYByX: Record<string, number> = {}
      const spendLblYByX: Record<string, number> = {}
      for (let ci = 0; ci < data.length; ci++) {
        clicksYByX[G.xs[ci].toFixed(1)] = scaleY(data[ci].c, clicksMax)
        if (data[ci].s > 0) {
          const spendH = (data[ci].s / spendMax) * (G.yBot - G.yTop)
          spendLblYByX[G.xs[ci].toFixed(1)] = G.yBot - spendH - 4
        }
      }

      for (const it of cpaItems) {
        const cy = cpaY(it.cpa)
        const dot = makeEl('circle', {
          cx: it.x.toFixed(1),
          cy: cy.toFixed(1),
          r: '2.75',
          fill: 'rgb(139,92,246)',
        })
        addTitle(dot, it.m + ': $' + Math.round(it.cpa) + ' CPL')
        root.appendChild(dot)
        const clicksY = clicksYByX[it.x.toFixed(1)] ?? -100
        const spendY = spendLblYByX[it.x.toFixed(1)]
        let lblY = cy - 6
        if (cy <= G.yTop + 0.5) lblY = G.yTop - 6
        if (Math.abs(lblY - clicksY) < 9 || Math.abs(lblY - (clicksY - 4)) < 9) {
          lblY = Math.min(clicksY, cy) - 12
        }
        if (spendY != null && Math.abs(lblY - spendY) < 9) {
          lblY = spendY - 10
        }
        root.appendChild(
          makeEl(
            'text',
            {
              x: it.x.toFixed(1),
              y: lblY.toFixed(1),
              'text-anchor': 'middle',
              'font-size': '8',
              fill: 'rgb(109,40,217)',
              'font-weight': '700',
            },
            '$' + Math.round(it.cpa).toLocaleString(),
          ),
        )
      }
    }
  }, [chartSeries, geo, view, spendMax, clicksMax, convMax, cpaMax])

  const geoBtnClass = (active: boolean, withBorder: boolean) =>
    'px-3 py-1.5 transition-colors ' +
    (active ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50') +
    (withBorder ? ' border-l border-slate-300' : '')

  return (
    <>
      {/* Top stat cards */}
      <div className="max-w-4xl mx-auto w-full">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0">
              Total Spend
            </div>
            <div className="text-xl font-bold text-slate-900">
              {fmtSpend(chartSeries.all.reduce((sum, row) => sum + row.s, 0))}
            </div>
            <div className="text-[10px] text-slate-500">{periodLabel}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0">
              Total Clicks
            </div>
            <div className="text-xl font-bold text-slate-900">
              {fmtNum(chartSeries.all.reduce((sum, row) => sum + row.c, 0))}
            </div>
            <div className="text-[10px] text-slate-500">all channels</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0">
              Reported Primary Conversions
            </div>
            <div className="text-xl font-bold text-slate-900">
              {fmtNum(chartSeries.all.reduce((sum, row) => sum + row.v, 0))}
            </div>
            <div className="text-[10px] text-slate-500">reported conversions</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0">
              <span>{cplCard.label}</span> CPL
            </div>
            <div className="text-xl font-bold text-slate-900">{cplCard.value}</div>
            <div className="text-[10px] text-slate-500">reported-period average</div>
          </div>
        </div>
      </div>

      {/* Chart card */}
      <div className="px-4 pb-2">
        <div className="bg-white rounded-lg p-3 border border-slate-200">
          <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded border border-slate-300 overflow-hidden text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setGeo('all')}
                  className={geoBtnClass(geo === 'all', false)}
                >
                  All
                </button>
                {geoAvailable && (
                  <button
                    type="button"
                    onClick={() => setGeo('AU')}
                    className={geoBtnClass(geo === 'AU', true)}
                  >
                    AU
                  </button>
                )}
                {geoAvailable && (
                  <button
                    type="button"
                    onClick={() => setGeo('US')}
                    className={geoBtnClass(geo === 'US', true)}
                  >
                    US
                  </button>
                )}
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Monthly performance
              </span>
            </div>
            <button
              onClick={() => setView(view === 'cpa' ? 'convs' : 'cpa')}
              className="text-xs font-medium px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {view === 'cpa' ? 'Switch to Conversions' : 'Switch to CPL'}
            </button>
          </div>

          <svg viewBox="0 0 960 365" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
            <line
              x1="100"
              x2="820"
              y1="300.0"
              y2="300.0"
              stroke="rgb(226,232,240)"
              strokeDasharray="2,3"
              strokeWidth="0.75"
            />
            <line
              x1="100"
              x2="820"
              y1="232.5"
              y2="232.5"
              stroke="rgb(226,232,240)"
              strokeDasharray="2,3"
              strokeWidth="0.75"
            />
            <line
              x1="100"
              x2="820"
              y1="165.0"
              y2="165.0"
              stroke="rgb(226,232,240)"
              strokeDasharray="2,3"
              strokeWidth="0.75"
            />
            <line
              x1="100"
              x2="820"
              y1="97.5"
              y2="97.5"
              stroke="rgb(226,232,240)"
              strokeDasharray="2,3"
              strokeWidth="0.75"
            />
            <line
              x1="100"
              x2="820"
              y1="30.0"
              y2="30.0"
              stroke="rgb(226,232,240)"
              strokeDasharray="2,3"
              strokeWidth="0.75"
            />
            <text
              x="92"
              y="303.0"
              fontSize="9"
              fill="rgb(37,99,235)"
              textAnchor="end"
              fontWeight="700"
            >
              $0
            </text>
            <text
              x="92"
              y="235.5"
              fontSize="9"
              fill="rgb(37,99,235)"
              textAnchor="end"
              fontWeight="700"
            >
              {fmtSpend(spendMax * 0.25)}
            </text>
            <text
              x="92"
              y="168.0"
              fontSize="9"
              fill="rgb(37,99,235)"
              textAnchor="end"
              fontWeight="700"
            >
              {fmtSpend(spendMax * 0.5)}
            </text>
            <text
              x="92"
              y="100.5"
              fontSize="9"
              fill="rgb(37,99,235)"
              textAnchor="end"
              fontWeight="700"
            >
              {fmtSpend(spendMax * 0.75)}
            </text>
            <text
              x="92"
              y="33.0"
              fontSize="9"
              fill="rgb(37,99,235)"
              textAnchor="end"
              fontWeight="700"
            >
              {fmtSpend(spendMax)}
            </text>

            {view === 'convs' ? (
              <g>
                <text
                  x="828"
                  y="303.0"
                  fontSize="9"
                  fill="rgb(194,65,12)"
                  textAnchor="start"
                  fontWeight="700"
                >
                  0
                </text>
                <text
                  x="828"
                  y="235.5"
                  fontSize="9"
                  fill="rgb(194,65,12)"
                  textAnchor="start"
                  fontWeight="700"
                >
                  {Math.round(convMax * 0.25)}
                </text>
                <text
                  x="828"
                  y="168.0"
                  fontSize="9"
                  fill="rgb(194,65,12)"
                  textAnchor="start"
                  fontWeight="700"
                >
                  {Math.round(convMax * 0.5)}
                </text>
                <text
                  x="828"
                  y="100.5"
                  fontSize="9"
                  fill="rgb(194,65,12)"
                  textAnchor="start"
                  fontWeight="700"
                >
                  {Math.round(convMax * 0.75)}
                </text>
                <text
                  x="828"
                  y="33.0"
                  fontSize="9"
                  fill="rgb(194,65,12)"
                  textAnchor="start"
                  fontWeight="700"
                >
                  {Math.round(convMax)}
                </text>
              </g>
            ) : (
              <g>
                <text
                  x="828"
                  y="303.0"
                  fontSize="9"
                  fill="rgb(124,58,237)"
                  textAnchor="start"
                  fontWeight="700"
                >
                  $0
                </text>
                <text
                  x="828"
                  y="235.5"
                  fontSize="9"
                  fill="rgb(124,58,237)"
                  textAnchor="start"
                  fontWeight="700"
                >
                  {fmtSpend(cpaMax * 0.25)}
                </text>
                <text
                  x="828"
                  y="168.0"
                  fontSize="9"
                  fill="rgb(124,58,237)"
                  textAnchor="start"
                  fontWeight="700"
                >
                  {fmtSpend(cpaMax * 0.5)}
                </text>
                <text
                  x="828"
                  y="100.5"
                  fontSize="9"
                  fill="rgb(124,58,237)"
                  textAnchor="start"
                  fontWeight="700"
                >
                  {fmtSpend(cpaMax * 0.75)}
                </text>
                <text
                  x="828"
                  y="33.0"
                  fontSize="9"
                  fill="rgb(124,58,237)"
                  textAnchor="start"
                  fontWeight="700"
                >
                  {fmtSpend(cpaMax)}
                </text>
              </g>
            )}

            <line x1="100" x2="100" y1="30" y2="300" stroke="rgb(71,85,105)" strokeWidth="1.25" />
            <line x1="820" x2="820" y1="30" y2="300" stroke="rgb(71,85,105)" strokeWidth="1.25" />
            <line x1="100" x2="820" y1="300" y2="300" stroke="rgb(71,85,105)" strokeWidth="1.25" />

            <text
              x="28"
              y="165.0"
              fontSize="10"
              fill="rgb(51,65,85)"
              fontWeight="700"
              textAnchor="middle"
              transform="rotate(-90 28 165.0)"
            >
              <tspan fill="rgb(37,99,235)">Spend (AUD)</tspan>{' '}
              <tspan fill="rgb(71,85,105)">/</tspan> <tspan fill="rgb(5,150,105)">Clicks</tspan>
            </text>
            {view === 'convs' ? (
              <text
                x="930"
                y="165.0"
                fontSize="10"
                fill="rgb(234,88,12)"
                fontWeight="700"
                textAnchor="middle"
                transform="rotate(90 930 165.0)"
              >
                Conversions (form-fills)
              </text>
            ) : (
              <text
                x="930"
                y="165.0"
                fontSize="10"
                fill="rgb(124,58,237)"
                fontWeight="700"
                textAnchor="middle"
                transform="rotate(90 930 165.0)"
              >
                CPL (AUD)
              </text>
            )}

            <g ref={dataGroupRef} />

            {/* Month labels along X axis */}
            {chartSeries.all.map((row, i) => (
              <text
                key={row.m}
                x={G.xs[i].toFixed(1)}
                y="320.0"
                textAnchor="middle"
                fontSize="9"
                fill="rgb(71,85,105)"
                fontWeight="500"
                transform={`rotate(-45 ${G.xs[i].toFixed(1)} 320.0)`}
              >
                {row.m}
              </text>
            ))}

            <text
              x="460.0"
              y="354"
              textAnchor="middle"
              fontSize="10"
              fill="rgb(51,65,85)"
              fontWeight="700"
            >
              Month
            </text>

            {/* Legend */}
            <g>
              <rect
                x="100"
                y="8"
                width="12"
                height="8"
                fill="rgb(37,99,235)"
                opacity="0.75"
                rx="1"
              />
              <text x="118" y="15" fontSize="9.5" fill="rgb(51,65,85)" fontWeight="600">
                Spend (bars)
              </text>
            </g>
            <g>
              <line x1="203.6" x2="217.6" y1="12" y2="12" stroke="rgb(5,150,105)" strokeWidth="2" />
              <circle cx="210.6" cy="12" r="2.75" fill="rgb(5,150,105)" />
              <text x="221.6" y="15" fontSize="9.5" fill="rgb(51,65,85)" fontWeight="600">
                Clicks
              </text>
            </g>
            {view === 'convs' ? (
              <g>
                <line
                  x1="272.4"
                  x2="286.4"
                  y1="12"
                  y2="12"
                  stroke="rgb(234,88,12)"
                  strokeWidth="2"
                  strokeDasharray="4,2"
                />
                <circle cx="279.4" cy="12" r="2.75" fill="rgb(234,88,12)" />
                <text x="290.4" y="15" fontSize="9.5" fill="rgb(51,65,85)" fontWeight="600">
                  Conversions
                </text>
              </g>
            ) : (
              <g>
                <line
                  x1="272.4"
                  x2="286.4"
                  y1="12"
                  y2="12"
                  stroke="rgb(139,92,246)"
                  strokeWidth="2"
                  strokeDasharray="4,2"
                />
                <circle cx="279.4" cy="12" r="2.75" fill="rgb(139,92,246)" />
                <text x="290.4" y="15" fontSize="9.5" fill="rgb(51,65,85)" fontWeight="600">
                  CPL
                </text>
              </g>
            )}
          </svg>

          <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500 italic">
              The chart uses the supplied monthly account rows. Primary conversions include the
              account&apos;s current conversion action set and should not be read as qualified
              leads.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
