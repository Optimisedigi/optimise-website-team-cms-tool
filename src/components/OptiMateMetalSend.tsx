'use client'

import type { ReactElement } from 'react'
import { MetalFx } from 'metal-fx'

interface OptiMateMetalControlProps {
  children: ReactElement
}

/** Shared liquid-metal halo for the circular OptiMate send control. */
export default function OptiMateMetalSend({ children }: OptiMateMetalControlProps) {
  return (
    <MetalFx
      preset="chromatic"
      variant="circle"
      strength={1}
      theme="dark"
      borderRadius={19}
      style={{
        order: 2,
        width: 38,
        height: 38,
        flex: '0 0 38px',
        borderRadius: '50%',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </MetalFx>
  )
}

/** The same liquid-metal halo shaped around a compact pill control. */
export function OptiMateMetalPill({ children }: OptiMateMetalControlProps) {
  return (
    <MetalFx
      preset="chromatic"
      variant="button"
      strength={1}
      theme="dark"
      borderRadius={999}
      style={{
        display: 'inline-flex',
        borderRadius: 999,
        boxSizing: 'border-box',
      }}
    >
      {children}
    </MetalFx>
  )
}
