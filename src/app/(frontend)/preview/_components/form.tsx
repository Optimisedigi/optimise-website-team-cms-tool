'use client'

import React, { useState } from 'react'

export function Field({
  label,
  opt,
  value,
  select,
  hint,
  selectMuted,
}: {
  label?: React.ReactNode
  opt?: string
  value: React.ReactNode
  select?: boolean
  hint?: React.ReactNode
  selectMuted?: boolean
}): React.ReactElement {
  return (
    <div className="field">
      {label != null ? (
        <label>
          {label} {opt ? <span className="opt">{opt}</span> : null}
        </label>
      ) : null}
      <div className={select ? 'select' : 'input filled'} style={selectMuted ? { color: 'var(--t3)' } : undefined}>
        {value}
      </div>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}

export function Tabs({ tabs, activeIndex = 0 }: { tabs: string[]; activeIndex?: number }): React.ReactElement {
  return (
    <div className="tabs">
      {tabs.map((t, i) => (
        <div className={`tab${i === activeIndex ? ' active' : ''}`} key={t}>
          {t}
        </div>
      ))}
    </div>
  )
}

export function SaveBar(): React.ReactElement {
  return (
    <div className="savebar">
      <div className="status">
        <span className="dotg" /> Unsaved changes
      </div>
      <div className="spacer" style={{ flex: 1 }} />
      <button className="btn">Discard</button>
      <button className="btn primary">Save changes</button>
    </div>
  )
}

export function ServicePill({ label, defaultOn = false }: { label: string; defaultOn?: boolean }): React.ReactElement {
  const [on, setOn] = useState(defaultOn)
  return (
    <span className={`svc-pill${on ? ' on' : ''}`} onClick={() => setOn((v) => !v)}>
      {label}
    </span>
  )
}

export function Switch({ off = false }: { off?: boolean }): React.ReactElement {
  return <div className={`switch${off ? ' off' : ''}`} />
}
