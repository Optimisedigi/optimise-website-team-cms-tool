const LINK_STYLE = 'color:#2563eb;text-decoration:underline;'

/**
 * Only http(s) and mailto survive. Editor HTML is stored raw and re-rendered with
 * dangerouslySetInnerHTML, so a `javascript:` href would run on click.
 */
export function safeLinkHref(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || trimmed.startsWith('//') ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(candidate, 'https://invalid.local')
  } catch {
    return null
  }
  if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) return null
  return url.href
}

/**
 * Cmd/Ctrl+K turns the selected text into a link, so notes show wording rather
 * than a raw URL. Returns false when the shortcut does not apply.
 */
export function applyLinkShortcut(
  event: { metaKey: boolean; ctrlKey: boolean; key: string; preventDefault: () => void },
  promptForUrl: (current: string) => string | null = (current) => window.prompt('Link URL', current),
): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return false
  event.preventDefault()

  const selection = window.getSelection()
  const existing = findSelectedLink(selection)
  if (!selection || selection.isCollapsed) {
    // Nothing selected: only useful for editing a link the caret already sits in.
    if (!existing) return true
  }

  const answer = promptForUrl(existing?.getAttribute('href') || '')
  if (answer === null) return true

  if (!answer.trim()) {
    if (existing) unwrap(existing)
    else selectedLinks(selection).forEach(unwrap)
    return true
  }

  const href = safeLinkHref(answer)
  if (!href) return true

  // Caret inside an existing link, or selection covering exactly it: just retarget it.
  if (existing && (selection?.isCollapsed || selection?.toString() === existing.textContent)) {
    existing.setAttribute('href', href)
    return true
  }

  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  if (!range || range.collapsed) return true

  const anchor = document.createElement('a')
  anchor.setAttribute('href', href)
  anchor.setAttribute('target', '_blank')
  anchor.setAttribute('rel', 'noreferrer')
  anchor.setAttribute('style', LINK_STYLE)
  // extractContents survives selections that span several nodes, unlike surroundContents.
  anchor.appendChild(range.extractContents())
  // Nested anchors are invalid, so drop any links the selection swallowed.
  anchor.querySelectorAll('a').forEach(unwrap)
  range.insertNode(anchor)
  selection?.removeAllRanges()
  return true
}

/** The link the caret sits in, or the single link the selection wraps. */
function findSelectedLink(selection: Selection | null): HTMLAnchorElement | null {
  const inCaret = selection?.anchorNode?.parentElement?.closest('a') as HTMLAnchorElement | null
  if (inCaret) return inCaret
  const links = selectedLinks(selection)
  return links.length === 1 && links[0].textContent === selection?.toString() ? links[0] : null
}

function selectedLinks(selection: Selection | null): HTMLAnchorElement[] {
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  const container = range?.commonAncestorContainer
  const root = (container?.nodeType === Node.ELEMENT_NODE ? container : container?.parentElement) as Element | null
  if (!root || !range) return []
  return Array.from(root.querySelectorAll('a')).filter((link) => range.intersectsNode(link))
}

function unwrap(element: Element): void {
  const parent = element.parentNode
  if (!parent) return
  while (element.firstChild) parent.insertBefore(element.firstChild, element)
  parent.removeChild(element)
}
