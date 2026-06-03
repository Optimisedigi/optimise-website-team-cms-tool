import React from 'react'
import { notFound } from 'next/navigation'
import '../../../styles/od-design-system.scss'

export const metadata = {
  title: 'UI Prototype — Optimise Digital',
  robots: { index: false, follow: false },
}

export default function PreviewLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  // Dev-only harness: these mockup-faithful prototypes never ship to a production deploy.
  // Gate on VERCEL_ENV (set only on real Vercel production deploys) rather than NODE_ENV,
  // which can be exported as "production" in local shells running `next dev`.
  if (process.env.VERCEL_ENV === 'production') {
    notFound()
  }
  return <>{children}</>
}
