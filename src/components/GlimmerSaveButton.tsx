'use client'

import type { SaveButtonClientProps } from 'payload'

import React, { useEffect, useRef, useState } from 'react'
import {
  FormSubmit,
  useDocumentInfo,
  useEditDepth,
  useForm,
  useFormModified,
  useFormProcessing,
  useFormSubmitted,
  useHotkey,
  useOperation,
  useTranslation,
} from '@payloadcms/ui'

/**
 * Replacement for Payload's default Save button.
 *
 * Behaviour change requested by the team: instead of the "saved successfully"
 * toast pop-up, the save bar itself should react — the button briefly glimmers
 * and pulses, and its label flips from "Save" to "Saved" before settling back.
 *
 * How it works:
 *  - We call `submit({ disableSuccessStatus: true })`, which tells Payload's
 *    Form to skip the success toast (error toasts still show — those stay
 *    useful). See @payloadcms/ui Form `disableToast` handling.
 *  - We detect a completed save by watching the form's `processing` flag drop
 *    from true → false. If the form is NOT in an errored/submitted state at
 *    that point, the save succeeded, so we play the glimmer + "Saved" label for
 *    a short window.
 *
 * Mirrors the core SaveButton's disabled logic and cmd/ctrl+S hotkey so the
 * only visible difference is the success feedback.
 */

const STYLE_ID = 'glimmer-save-button-styles'
const SAVED_DURATION_MS = 1800

function ensureStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes glimmerSavePulse {
      0%   { transform: scale(1);    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.55); }
      35%  { transform: scale(1.04); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
      100% { transform: scale(1);    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }
    @keyframes glimmerSaveSheen {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .glimmer-save--saved button,
    button.glimmer-save--saved {
      animation: glimmerSavePulse 0.9s ease-out 1;
      background-image: linear-gradient(
        100deg,
        rgba(255, 255, 255, 0) 30%,
        rgba(255, 255, 255, 0.55) 50%,
        rgba(255, 255, 255, 0) 70%
      );
      background-size: 200% 100%;
      background-repeat: no-repeat;
      background-color: #10b981 !important;
      border-color: #10b981 !important;
      color: #fff !important;
      opacity: 1 !important;
    }
    .glimmer-save--saved button {
      animation:
        glimmerSavePulse 0.9s ease-out 1,
        glimmerSaveSheen 0.9s ease-out 1;
    }
  `
  document.head.appendChild(style)
}

export function GlimmerSaveButton({ label: labelProp }: SaveButtonClientProps): React.ReactElement {
  const { uploadStatus } = useDocumentInfo()
  const { t } = useTranslation()
  const { submit } = useForm()
  const modified = useFormModified()
  const processing = useFormProcessing()
  const submitted = useFormSubmitted()
  const operation = useOperation()
  const editDepth = useEditDepth()

  const ref = useRef<HTMLButtonElement>(null)
  const wasProcessingRef = useRef(false)
  const pendingSaveRef = useRef(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  const defaultLabel = labelProp || t('general:save')

  useEffect(() => {
    ensureStyles()
  }, [])

  // Detect a completed, successful save: processing fell from true → false and
  // the form is not flagged as submitted-with-errors.
  useEffect(() => {
    const finished = wasProcessingRef.current && !processing
    wasProcessingRef.current = processing

    if (!finished || !pendingSaveRef.current) return
    pendingSaveRef.current = false

    if (submitted) return // errored — core shows the error toast, no "Saved"

    setJustSaved(true)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    savedTimerRef.current = setTimeout(() => setJustSaved(false), SAVED_DURATION_MS)
  }, [processing, submitted])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  const disabled = (operation === 'update' && !modified) || uploadStatus === 'uploading'

  useHotkey({ cmdCtrlKey: true, editDepth, keyCodes: ['s'] }, (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return
    ref.current?.click()
  })

  const handleSubmit = (): void => {
    if (uploadStatus === 'uploading') return
    pendingSaveRef.current = true
    void submit({ disableSuccessStatus: true })
  }

  // While this button's submit is in flight, surface a "Saving…" label so the
  // user gets immediate feedback between pressing Save and the "Saved" pulse.
  const isSaving = processing && pendingSaveRef.current
  const label = isSaving ? 'Saving…' : justSaved ? 'Saved' : defaultLabel

  return (
    <FormSubmit
      buttonId="action-save"
      className={justSaved ? 'glimmer-save--saved' : undefined}
      disabled={disabled}
      onClick={handleSubmit}
      ref={ref}
      size="medium"
      type="button"
    >
      {label}
    </FormSubmit>
  )
}
