'use client'

import React from 'react'
import { SaveButton } from '@payloadcms/ui'

/**
 * Global save button wrapper.
 * Replaces Payload's default save button.
 * Animation and toast feedback are handled by the SaveLoaderToast component.
 */
export const RocketSaveButton: React.FC = () => {
  return <SaveButton />
}
