'use client'

import { useDocumentInfo, useAllFormFields } from '@payloadcms/ui'
import OptiMateChatCore from './OptiMateChatCore'

/**
 * Payload field wrapper for the OptiMate chat. Reads the audit's id, businessName,
 * and customerId from the surrounding form, then renders the presentational
 * OptiMateChatCore. Renders an empty-state when no Customer ID is saved yet.
 */
const GoogleAdsChat = () => {
  const { id } = useDocumentInfo()
  const [fields] = useAllFormFields()

  if (!id) return null

  const customerId = fields?.customerId?.value as string | undefined
  const businessName = fields?.businessName?.value as string | undefined

  if (!customerId) {
    return (
      <div style={{ padding: 16, color: '#9ca3af', fontSize: 13 }}>
        Save a Customer ID on the Client Info tab to use the chat.
      </div>
    )
  }

  return (
    <OptiMateChatCore
      auditId={id}
      customerId={customerId}
      businessName={businessName}
    />
  )
}

export default GoogleAdsChat
