'use client'

import React from 'react'
import { useRouteTransition } from '@payloadcms/ui'

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
          <div className="od-splash">
            <div className="od-splash__scene">
              <div className="od-splash__flames">
                <div className="od-splash__flame od-splash__flame--1" />
                <div className="od-splash__flame od-splash__flame--2" />
                <div className="od-splash__flame od-splash__flame--3" />
              </div>
              <div className="od-splash__rocket">
                <img src="/optimise-rocket-logo-black.png" alt="" width={48} height={48} />
              </div>
            </div>
            <div className="od-splash__text">Loading</div>
          </div>
        </div>
      )}
      {children}
    </>
  )
}

export default RocketLoader
