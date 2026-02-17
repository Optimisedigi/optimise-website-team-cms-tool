'use client'

import { useMemo, useState } from 'react'

interface Question {
  question: string
  source: string
  modifier: string
  searchVolume: number | null
}

interface Cluster {
  label: string
  questions: Question[]
}

interface KeywordSunburstProps {
  keyword: string
  clusters: Cluster[]
  maxQuestions?: number
  hideCenterLabel?: boolean
}

const CLUSTER_COLORS = [
  { bg: '#fcd5ce', ring: '#f4a89a', text: '#7c2d12' },
  { bg: '#d5c6f0', ring: '#b8a4e3', text: '#3b1f6e' },
  { bg: '#bfe0f5', ring: '#8ec8e8', text: '#0c4a6e' },
  { bg: '#fef08a', ring: '#fde047', text: '#713f12' },
  { bg: '#bbf7d0', ring: '#86efac', text: '#14532d' },
  { bg: '#fecaca', ring: '#fca5a5', text: '#7f1d1d' },
  { bg: '#e0e7ff', ring: '#c7d2fe', text: '#312e81' },
  { bg: '#fed7aa', ring: '#fdba74', text: '#7c2d12' },
]

const ALLOWED_CATEGORIES = new Set([
  'What', 'How', 'Who', 'When', 'Where', 'Which',
  'Can', 'Is', 'Are', 'Do', 'Will', 'Does', 'Should',
  'Vs', 'Best', 'General',
])

const FALLBACK_QUOTAS: Record<string, number> = {
  What: 6, How: 4, Which: 4, Can: 4, Who: 2, When: 2,
  Where: 2, Is: 2, Are: 2, Do: 2, Will: 2, Does: 2,
  Should: 2, Vs: 2, Best: 2, General: 0,
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r1: number, r2: number, startAngle: number, endAngle: number): string {
  const sweep = endAngle - startAngle
  const largeArc = sweep > 180 ? 1 : 0
  const s1 = polarToCartesian(cx, cy, r2, startAngle)
  const s2 = polarToCartesian(cx, cy, r2, endAngle)
  const s3 = polarToCartesian(cx, cy, r1, endAngle)
  const s4 = polarToCartesian(cx, cy, r1, startAngle)
  return `M ${s1.x} ${s1.y} A ${r2} ${r2} 0 ${largeArc} 1 ${s2.x} ${s2.y} L ${s3.x} ${s3.y} A ${r1} ${r1} 0 ${largeArc} 0 ${s4.x} ${s4.y} Z`
}

function wrapText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (test.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  if (lines.length > 3) {
    lines.length = 3
    lines[2] = lines[2].slice(0, maxChars - 1) + '\u2026'
  }
  return lines
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 1) + '\u2026'
}

function getMetaCategory(label: string): string {
  if (label === 'Other' || label === 'General') return 'General'
  if (label === 'Vs') return 'Vs'
  const firstWord = label.split(' ')[0]
  const capitalized = firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase()
  if (ALLOWED_CATEGORIES.has(capitalized)) return capitalized
  return 'General'
}

function detectQuestionCategory(question: string): string | null {
  const words = question.toLowerCase().split(/\s+/)
  for (const qw of ['what', 'how', 'which', 'who', 'why', 'when', 'where', 'can', 'are', 'is', 'do', 'will', 'does', 'should', 'best']) {
    if (words.includes(qw)) {
      return qw.charAt(0).toUpperCase() + qw.slice(1)
    }
  }
  if (words.includes('vs') || words.includes('versus')) return 'Vs'
  return null
}

interface SunburstSegment {
  question: string
  weight: number
  metaCategory: string
}

interface SunburstCluster {
  label: string
  colorIndex: number
  segments: SunburstSegment[]
  totalWeight: number
}

export default function KeywordSunburst({ keyword, clusters, maxQuestions = 40, hideCenterLabel = false }: KeywordSunburstProps) {
  const [hoveredSeg, setHoveredSeg] = useState<string | null>(null)

  const { sunburstClusters, grandTotal } = useMemo(() => {
    let volumeFound = false
    for (const cluster of clusters) {
      for (const q of cluster.questions) {
        if (q.searchVolume && q.searchVolume > 0) {
          volumeFound = true
          break
        }
      }
      if (volumeFound) break
    }

    const allQuestions: SunburstSegment[] = []
    for (const cluster of clusters) {
      const clusterMeta = getMetaCategory(cluster.label)
      for (const q of cluster.questions) {
        let metaCategory = clusterMeta
        if (metaCategory === 'General') {
          const detected = detectQuestionCategory(q.question)
          if (detected) metaCategory = detected
        }
        const weight = volumeFound ? (q.searchVolume || 0) : 1
        if (weight > 0) {
          allQuestions.push({ question: q.question, weight, metaCategory })
        }
      }
    }

    let selected: SunburstSegment[]

    if (volumeFound) {
      allQuestions.sort((a, b) => b.weight - a.weight)
      selected = allQuestions.slice(0, maxQuestions)
    } else {
      const byCategory = new Map<string, SunburstSegment[]>()
      for (const q of allQuestions) {
        if (!byCategory.has(q.metaCategory)) byCategory.set(q.metaCategory, [])
        byCategory.get(q.metaCategory)!.push(q)
      }

      selected = []
      const quotas = { ...FALLBACK_QUOTAS }
      let remaining = maxQuestions

      for (const [cat, quota] of Object.entries(quotas)) {
        const available = byCategory.get(cat) || []
        const take = Math.min(quota, available.length)
        selected.push(...available.slice(0, take))
        remaining -= take
        quotas[cat] = quota - take
      }

      if (remaining > 0) {
        const generalAll = byCategory.get('General') || []
        const alreadyTaken = selected.filter((s) => s.metaCategory === 'General').length
        const extra = generalAll.slice(alreadyTaken, alreadyTaken + remaining)
        selected.push(...extra)
        remaining -= extra.length
      }

      if (remaining > 0) {
        const usedQuestions = new Set(selected.map((s) => s.question))
        for (const q of allQuestions) {
          if (remaining <= 0) break
          if (!usedQuestions.has(q.question)) {
            selected.push(q)
            usedQuestions.add(q.question)
            remaining--
          }
        }
      }
    }

    const clusterMap = new Map<string, SunburstCluster>()
    for (const seg of selected) {
      if (!clusterMap.has(seg.metaCategory)) {
        clusterMap.set(seg.metaCategory, {
          label: seg.metaCategory,
          colorIndex: clusterMap.size % CLUSTER_COLORS.length,
          segments: [],
          totalWeight: 0,
        })
      }
      const c = clusterMap.get(seg.metaCategory)!
      c.segments.push(seg)
      c.totalWeight += seg.weight
    }

    const result = Array.from(clusterMap.values())
    const total = result.reduce((s, c) => s + c.totalWeight, 0)
    return { sunburstClusters: result, grandTotal: total }
  }, [clusters, maxQuestions])

  if (sunburstClusters.length === 0 || grandTotal === 0) return null

  const size = 900
  const cx = size / 2
  const cy = size / 2
  const innerRadius = 120
  const midRadius = 210
  const outerRadius = 410
  const gap = 1.5
  const hoverGrow = 22

  let angle = 0
  const arcs: { cluster: SunburstCluster; start: number; end: number; color: typeof CLUSTER_COLORS[0] }[] = []

  for (const cluster of sunburstClusters) {
    const sweep = (cluster.totalWeight / grandTotal) * 360
    arcs.push({ cluster, start: angle, end: angle + sweep, color: CLUSTER_COLORS[cluster.colorIndex] })
    angle += sweep
  }

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="sunburst-svg"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <style>{`
        .seg-group { transition: transform 0.2s ease; transform-origin: ${cx}px ${cy}px; }
        .seg-group:hover { z-index: 10; }
        .seg-path { transition: filter 0.2s ease; }
        .seg-group:hover .seg-path { filter: brightness(0.95); }
      `}</style>

      {arcs.map((ca, ci) => {
        const { cluster, start, end, color } = ca
        const clusterSweep = end - start

        const innerPath = arcPath(cx, cy, innerRadius, midRadius, start + gap / 2, end - gap / 2)

        const labelAngle = start + clusterSweep / 2
        const labelR = (innerRadius + midRadius) / 2
        const labelPos = polarToCartesian(cx, cy, labelR, labelAngle)
        const labelSvgRot = labelAngle - 90
        let labelRotation = labelSvgRot
        const labelAnchor: 'start' | 'middle' | 'end' = 'middle'
        if (labelAngle > 180) {
          labelRotation = labelSvgRot + 180
        }

        let segAngle = start
        const segments: React.ReactElement[] = []

        for (let si = 0; si < cluster.segments.length; si++) {
          const seg = cluster.segments[si]
          const segSweep = (seg.weight / grandTotal) * 360
          const segStart = segAngle + gap / 2
          const segEnd = segAngle + segSweep - gap / 2
          const segKey = `seg-${ci}-${si}`
          const isHovered = hoveredSeg === segKey

          if (segEnd > segStart) {
            const displayOuter = isHovered ? outerRadius + hoverGrow : outerRadius
            const segPath = arcPath(cx, cy, midRadius + 2, displayOuter, segStart, segEnd)

            const textAngle = segAngle + segSweep / 2
            const textR = midRadius + 14
            const textPos = polarToCartesian(cx, cy, textR, textAngle)

            const svgRot = textAngle - 90
            let rotation: number
            let anchor: 'start' | 'end'

            if (textAngle <= 180) {
              rotation = svgRot
              anchor = 'start'
            } else {
              rotation = svgRot + 180
              anchor = 'end'
            }

            const radialSpace = (isHovered ? displayOuter : outerRadius) - midRadius - 10
            const fontSize = isHovered ? 16 : 14.5
            const charWidth = fontSize * 0.58
            const maxChars = Math.max(10, Math.floor(radialSpace / charWidth))
            const lines = wrapText(seg.question, maxChars)

            const lineHeight = fontSize * 1.3
            const totalTextHeight = lines.length * lineHeight
            const startDy = -(totalTextHeight - lineHeight) / 2

            segments.push(
              <g
                key={segKey}
                className="seg-group"
                onMouseEnter={() => setHoveredSeg(segKey)}
                onMouseLeave={() => setHoveredSeg(null)}
                style={{ cursor: 'default' }}
              >
                <path d={segPath} fill={color.bg} stroke="white" strokeWidth="1.5" className="seg-path" />
                <text
                  x={textPos.x}
                  y={textPos.y}
                  transform={`rotate(${rotation}, ${textPos.x}, ${textPos.y})`}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  fontSize={fontSize}
                  fill={color.text}
                  fontWeight={isHovered ? '600' : '500'}
                  style={{ pointerEvents: 'none' }}
                >
                  {lines.map((line, li) => (
                    <tspan
                      key={li}
                      x={textPos.x}
                      dy={li === 0 ? startDy : lineHeight}
                      textAnchor={anchor}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>,
            )
          }
          segAngle += segSweep
        }

        return (
          <g key={`cluster-${ci}`}>
            <path d={innerPath} fill={color.ring} stroke="white" strokeWidth="2" />
            {clusterSweep > 15 && (
              <text
                x={labelPos.x}
                y={labelPos.y}
                transform={`rotate(${labelRotation}, ${labelPos.x}, ${labelPos.y})`}
                textAnchor={labelAnchor}
                dominantBaseline="middle"
                fontSize="15"
                fill={color.text}
                fontWeight="700"
              >
                {truncate(cluster.label, 20)}
              </text>
            )}
            {segments}
          </g>
        )
      })}

      {/* Center circle */}
      <circle cx={cx} cy={cy} r={innerRadius - 2} fill="white" />
      {!hideCenterLabel && (() => {
        // Split long keywords on word boundaries
        const centerLines: string[] = []
        if (keyword.length > 20) {
          const words = keyword.split(' ')
          let current = ''
          for (const word of words) {
            const test = current ? `${current} ${word}` : word
            if (test.length > 20 && current) {
              centerLines.push(current)
              current = word
            } else {
              current = test
            }
          }
          if (current) centerLines.push(current)
        } else {
          centerLines.push(keyword)
        }
        const lineHeight = 26
        const totalHeight = centerLines.length * lineHeight
        const startY = cy - (totalHeight - lineHeight) / 2
        return (
          <text
            x={cx}
            y={startY}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="20"
            fontWeight="700"
            fill="#1f2937"
            style={{ textTransform: 'capitalize' }}
          >
            {centerLines.map((line, i) => (
              <tspan key={i} x={cx} dy={i === 0 ? 0 : lineHeight}>{line}</tspan>
            ))}
          </text>
        )
      })()}
    </svg>
  )
}
