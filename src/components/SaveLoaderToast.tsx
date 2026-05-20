'use client'

import React, { useState, useEffect, useCallback } from 'react'

/**
 * Global save loader and toast notifications.
 * Monitors document saves and shows rocket animation + toast feedback.
 */
export const SaveLoaderToast: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSaving, setIsSaving] = useState(false)
  const [showToast, setShowToast] = useState<'success' | 'error' | null>(null)

  // Check if any form is being submitted
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null
    let wasSaving = false

    const checkSaving = () => {
      // Look for Payload's submit button with loading state
      const submitBtn = document.querySelector('[id="action-save"]')
      if (submitBtn) {
        const btn = submitBtn as HTMLButtonElement
        const isLoading = btn.disabled || btn.getAttribute('aria-disabled') === 'true' || btn.classList.contains('loading')
        
        if (isLoading && !wasSaving) {
          wasSaving = true
          setIsSaving(true)
          setShowToast(null)
        } else if (!isLoading && wasSaving) {
          wasSaving = false
          setIsSaving(false)
          setShowToast('success')
        }
      }
    }

    intervalId = setInterval(checkSaving, 200)

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [])

  // Auto-dismiss toast
  useEffect(() => {
    if (showToast) {
      const timeout = setTimeout(() => setShowToast(null), 3000)
      return () => clearTimeout(timeout)
    }
  }, [showToast])

  const dismissToast = useCallback(() => setShowToast(null), [])

  return (
    <>
      {children}

      {/* Rocket animation during save */}
      {isSaving && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ animation: 'od-rocket-pulse 0.8s ease-in-out infinite' }}>
            <img src="/optimise-rocket-logo-black.png" alt="" width={32} height={32} />
          </div>
          <style>{`
            @keyframes od-rocket-pulse {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.15); opacity: 0.8; }
            }
          `}</style>
        </div>
      )}

      {/* Toast notification */}
      {showToast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          background: showToast === 'success' ? '#059669' : '#DC2626',
          color: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          fontSize: '14px',
          fontWeight: 500,
          animation: 'od-toast-in 0.2s ease-out',
        }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            {showToast === 'success' ? (
              <path d="M16.667 5L7.5 14.167 3.333 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            ) : (
              <path d="M10 6.667v3.333M10 13.333h.008M17.5 10a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            )}
          </svg>
          <span>{showToast === 'success' ? 'Saved successfully' : 'Error saving'}</span>
          <button
            onClick={dismissToast}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: '4px',
              padding: '4px',
              background: 'transparent',
              border: 'none',
              color: 'white',
              opacity: 0.7,
              cursor: 'pointer',
              borderRadius: '4px',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <style>{`
            @keyframes od-toast-in {
              from { transform: translateY(20px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </>
  )
}
