import React from 'react'
import { Sidebar, MiniSidebar } from './Sidebar'
import { Topbar, type Crumb } from './Topbar'

export function Shell({
  activeKey,
  mini = false,
  crumbs,
  searchPlaceholder,
  collapseGlyph,
  pagePaddingTop,
  children,
}: {
  activeKey?: string
  mini?: boolean
  crumbs: Crumb[]
  searchPlaceholder?: string
  collapseGlyph?: React.ReactNode
  pagePaddingTop?: number
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="app">
      {mini ? <MiniSidebar activeKey={activeKey} /> : <Sidebar activeKey={activeKey} />}
      <div className="main">
        <Topbar crumbs={crumbs} searchPlaceholder={searchPlaceholder} collapseGlyph={collapseGlyph} />
        <div className="page" style={pagePaddingTop != null ? { paddingTop: pagePaddingTop } : undefined}>
          {children}
        </div>
      </div>
    </div>
  )
}
