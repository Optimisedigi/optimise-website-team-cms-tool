'use client'

import type { DefaultCellComponentProps } from 'payload'
import { avatarColor, avatarInitial, websiteHost } from '../clients-list/avatar-gradient'

const TITLE_FIELDS = ['businessName', 'contractTitle', 'clientName', 'name', 'title'] as const
const SUBTITLE_FIELDS = ['contactEmail', 'clientName', 'contactName'] as const

function stringFromValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function firstString(rowData: Record<string, unknown> | undefined, fields: readonly string[]): string {
  if (!rowData) return ''
  for (const field of fields) {
    const value = stringFromValue(rowData[field])
    if (value) return value
  }
  return ''
}

function titleFromProps(cellData: unknown, rowData: Record<string, unknown> | undefined): string {
  return stringFromValue(cellData) || firstString(rowData, TITLE_FIELDS)
}

function subtitleFromRow(rowData: Record<string, unknown> | undefined): string {
  if (!rowData) return ''
  const host = websiteHost(stringFromValue(rowData.websiteUrl) || stringFromValue(rowData.clientWebsite))
  return host || firstString(rowData, SUBTITLE_FIELDS)
}

function TitleAvatarCell({ cellData, rowData }: DefaultCellComponentProps) {
  const row = rowData as Record<string, unknown> | undefined
  const title = titleFromProps(cellData, row)
  const displayTitle = title || 'Untitled'
  const subtitle = subtitleFromRow(row)

  return (
    <div className="od-client-cell">
      <span
        className="od-client-cell__avatar"
        style={{ background: avatarColor(row?.id as number | string | null | undefined, displayTitle) }}
      >
        {avatarInitial(displayTitle)}
      </span>
      <span className="od-client-cell__text">
        <span className="od-client-cell__name">{displayTitle}</span>
        {subtitle ? <span className="od-client-cell__domain">{subtitle}</span> : null}
      </span>
    </div>
  )
}

export default TitleAvatarCell
