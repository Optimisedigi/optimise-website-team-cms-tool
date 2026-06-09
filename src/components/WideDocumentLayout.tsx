'use client'

import { useEffect } from 'react'

/**
 * Mount-only side-effect component that widens the Payload edit document while
 * it is mounted, then reverts on unmount.
 *
 * Collections with a sidebar field (e.g. Clients' `isAgency`) get
 * `.document-fields--has-sidebar`, which locks the main column to 66.66% — so
 * widening the browser does not give tab content more room. This stacks the
 * sidebar below the main column and lets the main column use the full width,
 * mirroring Payload's own narrow-viewport (`mid-break`) layout.
 *
 * Because Payload renders only the *active* tab's fields, placing this in a
 * single tab scopes the effect to that tab: switching tabs or leaving the page
 * unmounts it and restores the default two-column layout. The injected CSS is
 * gated on a body class so it can never leak to other admin pages.
 */
const BODY_CLASS = 'gads-wide-doc'
const STYLE_ID = 'gads-wide-doc-style'

const CSS = `
body.${BODY_CLASS} .document-fields--has-sidebar {
  display: block;
}
body.${BODY_CLASS} .document-fields--has-sidebar .document-fields__main {
  width: 100%;
  min-height: initial;
}
body.${BODY_CLASS} .document-fields--has-sidebar .document-fields__edit {
  border-right: 0;
  border-left: 0;
}
body.${BODY_CLASS} .document-fields--has-sidebar .document-fields__sidebar-wrap {
  position: static;
  width: 100%;
  height: initial;
  min-width: initial;
  border-left: 0;
}
`

export default function WideDocumentLayout(): null {
  useEffect(() => {
    if (typeof document === 'undefined') return

    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
    }
    document.body.classList.add(BODY_CLASS)

    return () => {
      document.body.classList.remove(BODY_CLASS)
      document.getElementById(STYLE_ID)?.remove()
    }
  }, [])

  return null
}
