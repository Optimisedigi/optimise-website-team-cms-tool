'use client'

import type { ReactElement } from 'react'
import { MetalFx } from 'metal-fx'

interface OptiMateMetalSendProps {
  children: ReactElement
}

/** Shared liquid-metal halo for the circular OptiMate send control. */
export default function OptiMateMetalSend({ children }: OptiMateMetalSendProps) {
  return (
    <MetalFx
      preset="chromatic"
      variant="circle"
      strength={1}
      theme="dark"
      innerShadow
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
