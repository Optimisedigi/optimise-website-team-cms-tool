'use client'

import { useEffect } from 'react'

/**
 * Injects a "Download PDF" button into the v2 deck's closing slide. The
 * button triggers the browser's print dialog (matching the pattern used
 * by other slide decks in this codebase).
 */
export function DownloadPdfButton(): null {
  useEffect(() => {
    const closing = document.querySelector<HTMLElement>('.proposal-v2 .closing')
    if (!closing) return
    // Avoid duplicate mounts (StrictMode, hot reload).
    if (closing.querySelector('.deck-download-pdf')) return

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'deck-download-pdf'
    btn.setAttribute('data-no-print', 'true')
    btn.setAttribute('aria-label', 'Download PDF')
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      <span>Download PDF</span>
    `
    btn.addEventListener('click', () => window.print())

    // Place the button as a flex sibling inside .who, right after the last
    // column ("Next"), so it sits inline in the same row.
    const who = closing.querySelector<HTMLElement>('.who')
    if (who) {
      who.appendChild(btn)
    } else {
      closing.appendChild(btn)
    }

    return () => {
      btn.remove()
    }
  }, [])

  return null
}
