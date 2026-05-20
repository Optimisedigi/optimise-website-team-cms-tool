'use client'

import React, { useState, useEffect, useRef } from 'react'

/**
 * Global save loader and toast notifications.
 * This component detects when any form in the CMS is being saved
 * and shows the rocket animation + success/error toasts.
 */
export const SaveLoaderToast: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSaving, setIsSaving] = useState(false)
  const [showToast, setShowToast] = useState<'success' | 'error' | null>(null)
  const toastRef = useRef<HTMLDivElement>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Monitor for form submissions and save state changes
  useEffect(() => {
    // Check for save button state periodically
    const checkSaveState = () => {
      // Look for Payload's save button in various states
      const saveButtons = document.querySelectorAll('[id="action-save"], button[type="submit"]')
      
      for (const btn of saveButtons) {
        const htmlBtn = btn as HTMLButtonElement
        
        // Check if the button has loading/processing state
        const isLoading = 
          htmlBtn.classList.contains('loading') ||
          htmlBtn.getAttribute('aria-disabled') === 'true' ||
          htmlBtn.disabled ||
          htmlBtn.textContent?.toLowerCase().includes('saving')
        
        if (isLoading && !isSaving) {
          setIsSaving(true)
          setShowToast(null)
          return
        }
      }
      
      // If we were saving but no button is loading anymore, save is complete
      if (isSaving && saveButtons.length > 0) {
        const stillLoading = Array.from(saveButtons).some(btn => {
          const htmlBtn = btn as HTMLButtonElement
          return htmlBtn.classList.contains('loading') ||
                 htmlBtn.getAttribute('aria-disabled') === 'true' ||
                 htmlBtn.disabled
        })
        
        if (!stillLoading) {
          // Save completed
          setIsSaving(false)
          setShowToast('success')
          
          // Clear any existing toast timeout
          if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current)
          }
          
          // Auto-dismiss toast after 3 seconds
          toastTimeoutRef.current = setTimeout(() => {
            setShowToast(null)
          }, 3000)
        }
      }
    }

    const interval = setInterval(checkSaveState, 100)
    return () => {
      clearInterval(interval)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    }
  }, [isSaving])

  // Listen for form submission events
  useEffect(() => {
    const handleSubmit = () => {
      setIsSaving(true)
      setShowToast(null)
    }

    const handleSaved = () => {
      setIsSaving(false)
      setShowToast('success')
      
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current)
      }
      toastTimeoutRef.current = setTimeout(() => {
        setShowToast(null)
      }, 3000)
    }

    const handleError = () => {
      setIsSaving(false)
      setShowToast('error')
      
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current)
      }
      toastTimeoutRef.current = setTimeout(() => {
        setShowToast(null)
      }, 3000)
    }

    document.addEventListener('payload:submit', handleSubmit)
    document.addEventListener('payload:saved', handleSaved)
    document.addEventListener('payload:error', handleError)

    return () => {
      document.removeEventListener('payload:submit', handleSubmit)
      document.removeEventListener('payload:saved', handleSaved)
      document.removeEventListener('payload:error', handleError)
    }
  }, [])

  return (
    <>
      {children}

      {/* Rocket animation during save */}
      {isSaving && (
        <div className="od-save-loader">
          <div className="od-save-loader__rocket">
            <img src="/optimise-rocket-logo-black.png" alt="" width={32} height={32} />
          </div>
          <style>{`
            .od-save-loader {
              position: fixed;
              bottom: 24px;
              right: 24px;
              z-index: 9999;
              display: flex;
              align-items: center;
              justify-content: center;
              pointer-events: none;
            }
            .od-save-loader__rocket {
              animation: od-rocket-pulse 0.8s ease-in-out infinite;
            }
            @keyframes od-rocket-pulse {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.15); opacity: 0.8; }
            }
          `}</style>
        </div>
      )}

      {/* Toast notification */}
      {showToast && (
        <div
          ref={toastRef}
          className="od-save-toast"
          role="status"
          aria-live="polite"
        >
          <div className="od-save-toast__icon">
            {showToast === 'success' ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M16.667 5L7.5 14.167 3.333 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 6.667v3.333M10 13.333h.008M17.5 10a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            )}
          </div>
          <span>{showToast === 'success' ? 'Saved successfully' : 'Error saving'}</span>
          <button
            className="od-save-toast__close"
            onClick={() => setShowToast(null)}
            aria-label="Dismiss"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <style>{`
            .od-save-toast {
              position: fixed;
              bottom: 24px;
              right: 24px;
              z-index: 99999;
              display: flex;
              align-items: center;
              gap: 10px;
              padding: 12px 16px;
              background: ${showToast === 'success' ? '#059669' : '#DC2626'};
              color: white;
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              font-size: 14px;
              font-weight: 500;
              animation: od-toast-in 0.2s ease-out;
            }
            @keyframes od-toast-in {
              from { transform: translateY(20px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
            .od-save-toast__icon {
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .od-save-toast__close {
              display: flex;
              align-items: center;
              justify-content: center;
              margin-left: 4px;
              padding: 4px;
              background: transparent;
              border: none;
              color: white;
              opacity: 0.7;
              cursor: pointer;
              border-radius: 4px;
              transition: opacity 0.15s;
            }
            .od-save-toast__close:hover {
              opacity: 1;
            }
          `}</style>
        </div>
      )}
    </>
  )
}
