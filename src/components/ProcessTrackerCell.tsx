'use client'

import type { DefaultCellComponentProps } from 'payload'

/**
 * Mini progress bar cell for the client-processes list view.
 * Shows completion percentage as a colored bar with percentage text.
 */
function ProcessTrackerCell({ rowData }: DefaultCellComponentProps) {
  // Compute completion from phases data
  const phases: any[] = rowData?.phases || []
  const totalSteps = phases.reduce(
    (sum: number, p: any) => sum + (p.steps?.length || 0),
    0,
  )
  const completedSteps = phases.reduce(
    (sum: number, p: any) =>
      sum +
      (p.steps || []).filter(
        (s: any) => s.stepStatus === 'completed' || s.stepStatus === 'skipped',
      ).length,
    0,
  )
  const pct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  if (totalSteps === 0) {
    return <span style={{ color: 'var(--theme-elevation-400)' }}>--</span>
  }

  const barColor = pct === 100 ? '#10B981' : pct > 0 ? '#3B82F6' : '#6B7280'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          background: 'var(--theme-elevation-100)',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: barColor,
            borderRadius: 3,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: barColor, minWidth: 32, textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  )
}

export default ProcessTrackerCell
