'use client'

import { NumberField, useFormFields } from '@payloadcms/ui'
import type { NumberFieldClientProps } from 'payload'

/**
 * Wraps the default NumberField to hide it in the edit view for agency clients.
 * This replaces the admin.condition approach so the custom Cell still renders in the list view.
 */
function MonthlyRetainerField(props: NumberFieldClientProps) {
  const isAgency = useFormFields(([fields]) => fields?.isAgency?.value)

  if (isAgency) return null

  return <NumberField {...props} />
}

export default MonthlyRetainerField
