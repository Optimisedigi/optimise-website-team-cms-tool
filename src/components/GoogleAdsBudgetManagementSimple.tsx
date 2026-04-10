'use client'

import { useState, useEffect } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

const GoogleAdsBudgetManagementSimple = () => {
  const { id } = useDocumentInfo()
  const [message, setMessage] = useState('Loading...')
  
  useEffect(() => {
    setMessage(`Budget Management loaded. ID: ${id}`)
  }, [id])
  
  return (
    <div style={{ padding: 20, border: '1px solid #ccc', borderRadius: 8, margin: 10 }}>
      <h3>Budget Management</h3>
      <p>{message}</p>
    </div>
  )
}

export default GoogleAdsBudgetManagementSimple
