'use client'

import type { DefaultCellComponentProps } from 'payload'
import { avatarColor, avatarInitial, logoUrl, websiteHost } from './avatar-gradient'

/**
 * "Client" column cell for the Clients list view.
 * Renders the client logo when one is uploaded, otherwise a gradient avatar
 * (first initial) whose colour is keyed on the row's unique id so no two
 * clients share a colour. The client name (strong) and website host (muted)
 * sit beside it — mirroring the approved prototype.
 *
 * `cellData` is the `name` value; `rowData` carries `id`, `logoThumbUrl`
 * (server-resolved), `logo`, and `websiteUrl`.
 */
function NameAvatarCell({ cellData, rowData }: DefaultCellComponentProps) {
  const name = typeof cellData === 'string' && cellData.trim() ? cellData : (rowData?.name ?? '')
  const host = websiteHost(rowData?.websiteUrl)
  // `logoThumbUrl` is resolved server-side (afterRead) because the list view
  // fetches at depth 0; fall back to a populated `logo` object when present.
  const logo =
    (typeof rowData?.logoThumbUrl === 'string' && rowData.logoThumbUrl) ||
    logoUrl(rowData?.logo)

  return (
    <div className="od-client-cell">
      {logo ? (
        <img className="od-client-cell__logo" src={logo} alt="" loading="lazy" />
      ) : (
        <span
          className="od-client-cell__avatar"
          style={{ background: avatarColor(rowData?.id, name) }}
        >
          {avatarInitial(name)}
        </span>
      )}
      <span className="od-client-cell__text">
        <span className="od-client-cell__name">{name || 'Untitled'}</span>
        {host ? <span className="od-client-cell__domain">{host}</span> : null}
      </span>
    </div>
  )
}

export default NameAvatarCell
