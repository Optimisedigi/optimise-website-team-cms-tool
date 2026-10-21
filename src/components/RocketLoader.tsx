'use client'

import React from 'react'
import { useRouteTransition } from '@payloadcms/ui'
import RocketSplash from './RocketSplash'

/**
 * Replaces Payload's default progress bar and loading overlay with
 * the Optimise Digital rocket splash animation during route transitions.
 */
const RocketLoader: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isTransitioning } = useRouteTransition()

  return (
    <>
      {isTransitioning && (
        <div className="od-route-loader">
          <RocketSplash />
        </div>
      )}
      {children}
    </>
  )
}

export default RocketLoader
