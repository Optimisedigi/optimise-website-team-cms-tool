import React from 'react'

type Trend = 'up' | 'down' | 'flat'

export function Stat({
  k,
  v,
  d,
  trend,
  swatch,
  vColor,
}: {
  k: React.ReactNode
  v: React.ReactNode
  d?: React.ReactNode
  trend?: Trend
  swatch?: string
  vColor?: string
}): React.ReactElement {
  return (
    <div className="stat">
      <div className="k">
        {swatch ? <span className="swatch" style={{ background: swatch }} /> : null}
        {k}
      </div>
      <div className="v" style={vColor ? { color: vColor } : undefined}>
        {v}
      </div>
      {d != null ? <div className={`d${trend ? ` ${trend}` : ''}`}>{d}</div> : null}
    </div>
  )
}

export function LegendItem({ color, children }: { color: string; children: React.ReactNode }): React.ReactElement {
  return (
    <span className="li">
      <span className="swatch" style={{ background: color }} /> {children}
    </span>
  )
}

export function Pill({
  variant,
  children,
}: {
  variant: 'green' | 'amber' | 'gray' | 'blue' | 'red' | 'teal' | 'violet'
  children: React.ReactNode
}): React.ReactElement {
  return <span className={`pill ${variant}`}>{children}</span>
}

export function Subhead({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }): React.ReactElement {
  return (
    <div className="subhead">
      <h4>{children}</h4>
      <div className="line" />
      {extra}
    </div>
  )
}
