'use client'

import type { DefaultCellComponentProps } from 'payload'

function normaliseScore(value: unknown): number | null {
  const score = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(score) ? score : null
}

function scoreTone(score: number): 'green' | 'blue' | 'amber' | 'red' {
  if (score >= 70 || (score <= 10 && score >= 7)) return 'green'
  if (score >= 45 || (score <= 10 && score >= 4.5)) return 'amber'
  return 'red'
}

function ScorePillCell({ cellData }: DefaultCellComponentProps) {
  const score = normaliseScore(cellData)
  if (score == null) return <span className="od-cell-muted">—</span>

  const max = score <= 10 ? 10 : 100
  return <span className={`od-pill od-pill--${scoreTone(score)}`}>{score}/{max}</span>
}

export default ScorePillCell
