'use client'

import React, { useState, useEffect, useRef } from 'react'
import { SaveButton, useForm } from '@payloadcms/ui'

/**
 * Global save button with rocket animation and toast feedback.
 * Replaces Payload's default save button to show the rocket animation
 * during save and success/error messages in the bottom right.
 */
export const RocketSaveButton: React.FC = () => {
  // Track if we're in a saving state by listening to the form
  const { submit } = useForm()
  const [isSaving, setIsSaving] = useState(false)
  const [showToast, setShowToast] = useState<'success' | 'error' | null>(null)
  const [hideTimeout, setHideTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)
  const toastRef = useRef<HTMLDivElement>(null)
  const originalSubmitRef = useRef<typeof submit | null>(null)

  // Wrap the submit function to track save state
  useEffect(() => {
    if (submit && !originalSubmitRef.current) {
      originalSubmitRef.current = submit
    }
  }, [submit])

  // Monitor save state by checking if the save button has been clicked
  // We use a mutation observer to detect when Payload's internal save state changes
  useEffect(() => {
    const checkSaveState = () => {
      // Payload sets data attributes on the save button during save
      const saveButton = document.querySelector('[type="submit"]:not([form]), [data-save]')
      if (saveButton) {
        const isProcessing = saveButton.getAttribute('aria-disabled') === 'true' || 
                            saveButton.classList.contains('loading')
        if (isProcessing && !isSaving) {
          setIsSaving(true)
        }
      }
    }

    const interval = setInterval(checkSaveState, 100)
    return () => clearInterval(interval)
  }, [isSaving])

  // Auto-dismiss toast
  useEffect(() => {
    if (showToast) {
      const timeout = setTimeout(() => {
        setShowToast(null)
      }, 3000)
      setHideTimeout(timeout)
      return () => clearTimeout(timeout)
    }
  }, [showToast])

  // Focus trap for toast accessibility
  useEffect(() => {
    if (showToast && toastRef.current) {
      toastRef.current.focus()
    }
  }, [showToast])

  // Intercept form submission
  useEffect(() => {
    const handleFormSubmit = () => {
      setIsSaving(true)
      setShowToast(null)
    }

    const handleFormSuccess = () => {
      setIsSaving(false)
      setShowToast('success')
    }

    const handleFormError = () => {
      setIsSaving(false)
      setShowToast('error')
    }

    // Listen to form events
    const form = document.querySelector('[id^="doc-form"], .payload-edit-form')
    if (form) {
      form.addEventListener('submit', handleFormSubmit)
      // Payload dispatches custom events on save complete
      form.addEventListener('payload:saved', handleFormSuccess)
      form.addEventListener('payload:error', handleFormError)
      
      return () => {
        form.removeEventListener('submit', handleFormSubmit)
        form.removeEventListener('payload:saved', handleFormSuccess)
        form.removeEventListener('payload:error', handleFormError)
      }
    }
  }, [])

  return (
    <>
      {/* Rocket animation overlay during save */}
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
          tabIndex={-1}
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
              outline: none;
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

      {/* Render the actual save button */}
      <SaveButton />
    </>
  )
}
