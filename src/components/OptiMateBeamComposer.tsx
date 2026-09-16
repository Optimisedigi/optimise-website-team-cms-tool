'use client'

import type { ReactNode } from 'react'
import { BorderBeam } from 'border-beam'
import styles from './OptiMateBeamComposer.module.css'

interface OptiMateBeamComposerProps {
  children: ReactNode
  className?: string
}

/**
 * Shared dark composer and animated perimeter for every OptiMate agent.
 * Agent-specific controls stay in their owning component.
 */
export default function OptiMateBeamComposer({
  children,
  className,
}: OptiMateBeamComposerProps) {
  const classes = className ? `${styles.beam} ${className}` : styles.beam
  const surface = (
    <div className={styles.surface} data-optimate-beam-composer="">
      {children}
    </div>
  )

  if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    return <div className={classes}>{surface}</div>
  }

  return (
    <BorderBeam
      size="md"
      colorVariant="colorful"
      strength={1}
      borderRadius={28}
      active
      theme="dark"
      className={classes}
    >
      {surface}
    </BorderBeam>
  )
}
