'use client'

import type { ReactElement } from 'react'
import { MetalFx } from 'metal-fx'

interface OptiMateMetalSendProps {
  children: ReactElement
  paused?: boolean
}

/** Shared liquid-metal halo for the circular OptiMate send control. */
export default function OptiMateMetalSend({ children, paused = false }: OptiMateMetalSendProps) {
  return (
    <MetalFx
      preset="chromatic"
      variant="circle"
      strength={1}
      theme="dark"
      innerShadow
      paused={paused}
      style={{ order: 2, flexShrink: 0 }}
    >
      {children}
    </MetalFx>
  )
}
