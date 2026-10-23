'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { ContentMapShell } from './content-map/ContentMapShell'

/** Payload ui field on Client → Blog Posts: the Content Map for this client. */
const ClientContentMap = () => {
  const { id } = useDocumentInfo()
  if (id === undefined || id === null || id === '') {
    return <div className="ccm-root" style={{ fontSize: 13, color: 'oklch(0.52 0.01 85)' }}>Save the client first to see its content map.</div>
  }
  return <ContentMapShell clientId={String(id)} />
}

export default ClientContentMap
