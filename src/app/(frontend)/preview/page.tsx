import React from 'react'
import Link from 'next/link'

const PAGES = [
  { n: '1', href: '/preview/dashboard', title: 'Dashboard', sub: 'Agency overview — KPIs, GSC, costs, GA4, funnel, drip' },
  { n: '2', href: '/preview/clients', title: 'Clients list', sub: 'Collapsed sidebar + data table with column toggles' },
  { n: '3', href: '/preview/google-ads', title: 'Google Ads client view', sub: 'Detail head, tabs, section-aside form, save bar' },
  { n: '4', href: '/preview/client-record', title: 'Specific client record', sub: 'Service pills, revenue strip, Business tab form' },
]

export default function PreviewIndex(): React.ReactElement {
  return (
    <div className="od-preview-index">
      <h1>UI Prototype Harness</h1>
      <div className="sub">Mockup-faithful React recreations of the four redesign pages.</div>
      {PAGES.map((p) => (
        <Link href={p.href} key={p.href}>
          <span className="n">{p.n}</span>
          <span>
            <b>{p.title}</b>
            <small>{p.sub}</small>
          </span>
        </Link>
      ))}
    </div>
  )
}
