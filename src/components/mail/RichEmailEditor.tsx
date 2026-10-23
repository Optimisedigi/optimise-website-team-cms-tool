'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import {
  $createParagraphNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $hasUpdateTag,
  $insertNodes,
  $isElementNode,
  $isLineBreakNode,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $nodesOfType,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  DROP_COMMAND,
  PASTE_COMMAND,
  PASTE_TAG,
  SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
  TextNode,
  type BaseSelection,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutputMap,
  type EditorState,
  type LexicalEditor,
  type LexicalNode,
  type ParagraphNode,
} from 'lexical'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { TablePlugin } from '@lexical/react/LexicalTablePlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { ORDERED_LIST, UNORDERED_LIST } from '@lexical/markdown'
import { DRAG_DROP_PASTE } from '@lexical/rich-text'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import {
  $insertList,
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
  REMOVE_LIST_COMMAND,
} from '@lexical/list'
import {
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  INSERT_TABLE_COMMAND,
  TableCellNode,
  TableNode,
  TableRowNode,
} from '@lexical/table'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { LinkNode } from '@lexical/link'
import { $createEmailImageNode, EmailImageNode } from './EmailImageNode'
import { EmailLinkPlugin } from './EmailLinkPlugin'
import { markdownLiteToBlocksHtml } from '../../lib/email-draft-markdown'
import { planBlockEdits, type BlockEdit } from '../../lib/mail/revise-edits'
import {
  columnWidths,
  estimateTextWidth,
  isGreetingLine,
  isTldrLine,
  MAX_SECTION_LABEL_CHARS,
  type MeasuredCell,
  type MeasureText,
} from '../../lib/mail/tidy-layout'
import styles from './ComposeWindow.module.css'

/**
 * Rich email body for the Mail compose window, built on Lexical.
 *
 * - One font, always: the body is Verdana at Gmail's "Normal" size (CSS
 *   `small`) and cannot be changed. Pasted text keeps bold, italic,
 *   underline, lists and tables, but never its font or size (Lexical does not
 *   import them, and inline code is turned back into plain text).
 * - Pasted text always comes in black, whatever colour it had at the source
 *   (see PASTE_TEXT_COLOR). It is an ordinary colour, so it can be changed
 *   afterwards. Loaded HTML (drafts, AI drafts, quoted mail) keeps its colours.
 * - Bold / italic / underline: Cmd/Ctrl+B, I, U (Lexical's built-in shortcuts;
 *   there are deliberately no toolbar buttons for them).
 * - Links: Cmd/Ctrl+K turns the selected text into a hyperlink, or edits or
 *   removes the link at the cursor (see EmailLinkPlugin). Pasted links keep
 *   their address.
 * - Text colour, bulleted and numbered lists: setTextColor() and toggleList(),
 *   driven by the compose window's formatting bar. A list only takes the
 *   cursor's line(s), even when lines share a paragraph (see $splitSelectedLines).
 *   Typing "- " (or * or +) at the start of a line starts a bulleted list,
 *   "1. " a numbered one (Markdown shortcuts; Cmd/Ctrl+Z undoes them).
 * - Tables: pasted tables (Sheets, Excel, Docs, web pages) are kept, and
 *   insertTable() adds an empty one. Copying out of the editor gives HTML
 *   tables other apps understand. Drag a column's right edge to resize it
 *   (see TableColumnResizePlugin).
 * - Images: pasted images (screenshots, copied images) go inline where the
 *   cursor is (see EmailImageNode; click one to resize it). When the
 *   clipboard holds an image file plus HTML or text with no words of its own
 *   (a copied web image, or a file copied in Finder), the image file wins,
 *   so the real picture is embedded. Pasted non-image files go to
 *   onPasteFiles so the compose window can attach them. Files dropped on the
 *   body are left to the compose window, which attaches them.
 *
 * Pasted HTML only becomes nodes Lexical knows about, so scripts, event
 * handlers and unknown markup never reach the body.
 */

export interface RichEmailEditorHandle {
  /** Body HTML (images still as data: URLs). */
  getHtml: () => string
  /** Body as markdown-lite text for the AI (tables as markdown tables, no images). */
  getMarkdown: () => string
  /** The body's blocks (paragraphs, lists, tables) as the AI sees them; empty lines are not blocks. */
  getBlocks: () => EmailBlock[]
  /**
   * Apply an AI revision to the blocks read by getBlocks (keys): only the
   * edited blocks change, the rest keep their text and formatting. False
   * (nothing changed) when one of those blocks is no longer in the body.
   */
  applyBlockEdits: (keys: string[], edits: BlockEdit[]) => boolean
  /**
   * Tidy the layout (Revise with no instruction, see lib/mail/tidy-layout):
   * table columns sized to their text with the first column unwrapped, and
   * empty lines after the greeting, before the TL;DR and bold section labels,
   * and after tables. False when it was already tidy.
   */
  tidyLayout: () => boolean
  /** The whole body as it is now, to restore later (undo an AI change). */
  snapshot: () => EditorSnapshot | null
  restore: (snapshot: EditorSnapshot) => void
  /** Replace the whole body. */
  setHtml: (html: string) => void
  insertTable: (rows: number, columns: number) => void
  insertImage: (src: string, alt: string, width: number | null) => void
  /** Colour the selected text (or what is typed next); null restores the default colour. */
  setTextColor: (color: string | null) => void
  /** Turn the selected blocks into a list of this type, or back into text if they already are one. */
  toggleList: (type: EmailListType) => void
  focus: () => void
}

export type EmailListType = 'bullet' | 'number'

/** One block of the body: its node key and its text as the AI sees it. */
export interface EmailBlock {
  key: string
  markdown: string
}

/** Saved body (Lexical editor states are immutable, so keeping one is safe). */
export type EditorSnapshot = EditorState

/** Formatting at the cursor, for the formatting bar's pressed states. */
export interface EmailSelectionFormat {
  list: EmailListType | null
  color: string | null
}

interface Props {
  initialHtml: string
  placeholder: string
  ariaLabel: string
  onContentChange: (hasContent: boolean) => void
  onPasteFiles: (files: File[]) => void
  onFormatChange?: (format: EmailSelectionFormat) => void
}

// Hex, rgb()/rgba() or a colour keyword; anything else is not imported.
const COLOR_RE = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(?:,\s*[\d.]+%?\s*)?\)|[a-z]{3,20})$/i
// Inline wrappers a colour can come from; block elements (p, div, td) do not colour text in the editor.
const INLINE_COLOR_TAGS = new Set(['SPAN', 'FONT', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'SUB', 'SUP', 'A', 'MARK', 'CODE'])

function safeColor(value: string | null | undefined): string | null {
  const color = (value ?? '').trim()
  return color && color.toLowerCase() !== 'inherit' && COLOR_RE.test(color) ? color : null
}

/** Text style with its colour replaced (or removed). Text styles only ever hold a colour here. */
function styleWithColor(style: string, color: string | null): string {
  const kept = style
    .split(';')
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration !== '' && !/^color\s*:/i.test(declaration))
  if (color) kept.push(`color: ${color}`)
  return kept.join('; ')
}

function colorOfStyle(style: string): string | null {
  const match = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)
  return safeColor(match?.[1])
}

/** Colour set on this element or the nearest inline wrapper around it (nested spans replace each other's forChild). */
function inlineColor(element: HTMLElement): string | null {
  for (let node: HTMLElement | null = element; node && INLINE_COLOR_TAGS.has(node.nodeName); node = node.parentElement) {
    const color = safeColor(node.style.color) ?? (node.nodeName === 'FONT' ? safeColor(node.getAttribute('color')) : null)
    if (color) return color
  }
  return null
}

function withColorForChild(output: DOMConversionOutput | null, color: string | null): DOMConversionOutput | null {
  if (!color) return output
  const base = output ?? { node: null }
  const forChild = base.forChild
  return {
    ...base,
    forChild: (child, parent) => {
      const next = forChild ? forChild(child, parent) : child
      if ($isTextNode(next)) next.setStyle(styleWithColor(next.getStyle(), color))
      return next
    },
  }
}

/** Colour every pasted text node gets, replacing the colour it was copied with. */
export const PASTE_TEXT_COLOR = '#000000'

/** Set this colour on every text node in the pasted nodes (tables and lists included). */
function $colorPastedNodes(nodes: LexicalNode[], color: string): void {
  for (const node of nodes) {
    if ($isTextNode(node)) node.setStyle(styleWithColor(node.getStyle(), color))
    else if ($isElementNode(node)) $colorPastedNodes(node.getChildren(), color)
  }
}

/**
 * True when Lexical will paste this as plain text: no copy from a Lexical
 * editor, and no HTML (or HTML identical to the text, which Lexical skips).
 */
function isPlainTextPaste(data: Pick<DataTransfer, 'getData'>): boolean {
  if (data.getData('application/x-lexical-editor')) return false
  const html = data.getData('text/html')
  return !html || html === data.getData('text/plain')
}

/**
 * Keep loaded text colour (pasted text is recoloured afterwards, see
 * PASTE_TEXT_COLOR). Lexical's own <span> import only reads bold,
 * italic and so on, so this runs it and then applies the colour; <font color>
 * (Outlook) is handled the same way. Fonts and sizes are still never imported.
 */
const colorImport: DOMConversionMap = {
  span: () => ({
    priority: 1,
    conversion: (element: HTMLElement) => {
      const base = TextNode.importDOM?.()?.span?.(element)?.conversion(element) ?? null
      return withColorForChild(base, inlineColor(element))
    },
  }),
  font: () => ({
    priority: 1,
    conversion: (element: HTMLElement) => withColorForChild(null, inlineColor(element)),
  }),
}

/**
 * Lexical writes a fixed 75px width on every table cell that has no width of
 * its own, which wraps words such as "Impressions" in the sent email while
 * the editor shows the column at its natural width. Cells without their own
 * width are exported without one, so mail apps size the column to its content
 * as the editor does. Widths set by tidying the layout or pasted from another
 * app are kept.
 */
const tableCellExport: DOMExportOutputMap = new Map([
  [
    TableCellNode,
    (editor, node) => {
      const output = node.exportDOM(editor)
      if ($isTableCellNode(node) && !node.getWidth() && output.element instanceof HTMLElement) {
        output.element.style.removeProperty('width')
      }
      return output
    },
  ],
])

function $selectionFormat(): EmailSelectionFormat {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return { list: null, color: null }
  const anchor = selection.anchor.getNode()
  const list = [anchor, ...anchor.getParents()].find($isListNode)
  const color = selection.isCollapsed() && selection.style ? colorOfStyle(selection.style) : null
  return {
    list: list ? (list.getListType() === 'number' ? 'number' : list.getListType() === 'bullet' ? 'bullet' : null) : null,
    color: color ?? ($isTextNode(anchor) ? colorOfStyle(anchor.getStyle()) : null),
  }
}

function $setTextColor(color: string | null): void {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return
  if (selection.isCollapsed()) {
    // Applies to the next text typed at the cursor.
    selection.setStyle(styleWithColor(selection.style, color))
    return
  }
  for (const node of selection.extract()) {
    if ($isTextNode(node)) node.setStyle(styleWithColor(node.getStyle(), color))
  }
}

const theme = {
  paragraph: styles.editorParagraph,
  text: { bold: styles.textBold, italic: styles.textItalic, underline: styles.textUnderline },
  link: styles.editorLink,
  table: styles.editorTable,
  tableCell: styles.editorTableCell,
  tableCellHeader: styles.editorTableHeader,
  list: {
    ul: styles.editorList,
    ol: styles.editorListNumber,
    listitem: styles.editorListItem,
    nested: { listitem: styles.editorNestedListItem },
  },
}

/** Markdown shortcuts: only lists ("- " / "1. "); the body has no headings, quotes or code. */
const LIST_SHORTCUTS = [UNORDERED_LIST, ORDERED_LIST]

/** Move each line (split at line breaks) of a paragraph into its own paragraph; returns them with each line's first child index. */
function $splitParagraphLines(paragraph: ParagraphNode): Array<{ node: ParagraphNode; start: number }> {
  const lines = [{ node: paragraph, start: 0 }]
  let current = paragraph
  paragraph.getChildren().forEach((child, index) => {
    if ($isLineBreakNode(child)) {
      const next = $createParagraphNode()
      next.setFormat(paragraph.getFormatType())
      next.setIndent(paragraph.getIndent())
      next.setTextFormat(paragraph.getTextFormat())
      next.setTextStyle(paragraph.getTextStyle())
      current.insertAfter(next)
      current = next
      lines.push({ node: next, start: index + 1 })
      child.remove()
    } else if (current !== paragraph) {
      current.append(child)
    }
  })
  return lines
}

/**
 * Give every line the selection touches its own paragraph. Lines made with
 * Shift+Enter, pasted, or loaded with <br> share one paragraph, so without
 * this a list made on the second line would take the line above with it.
 * Each paragraph is one line anyway (see linesToParagraphs), so the email
 * looks the same.
 */
function $splitSelectedLines(): void {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return
  const paragraphs = new Map<string, ParagraphNode>()
  for (const node of [selection.anchor.getNode(), selection.focus.getNode(), ...selection.getNodes()]) {
    const paragraph = $isParagraphNode(node) ? node : node.getParents().find($isParagraphNode)
    if (paragraph && paragraph.getChildren().some($isLineBreakNode)) paragraphs.set(paragraph.getKey(), paragraph)
  }
  if (paragraphs.size === 0) return
  const points = [selection.anchor, selection.focus].map((point) => ({ key: point.key, offset: point.offset, type: point.type }))
  const split = new Map<string, Array<{ node: ParagraphNode; start: number }>>()
  for (const [key, paragraph] of paragraphs) split.set(key, $splitParagraphLines(paragraph))
  const [anchor, focus] = points.map((point) => {
    const lines = point.type === 'element' ? split.get(point.key) : undefined
    if (!lines) return point
    // An element point counts children of the old paragraph: find its line and offset within it.
    const line = [...lines].reverse().find((candidate) => candidate.start <= point.offset) ?? lines[0]
    if (!line) return point
    return { key: line.node.getKey(), offset: point.offset - line.start, type: point.type }
  })
  if (!anchor || !focus) return
  selection.anchor.set(anchor.key, anchor.offset, anchor.type)
  selection.focus.set(focus.key, focus.offset, focus.type)
  selection.dirty = true
}

const BLOCK_SELECTOR = 'div, p, ul, ol, table, blockquote, h1, h2, h3, h4, h5, h6, pre, hr'

/**
 * Sent mail and saved drafts hold one Gmail line <div> per editor paragraph
 * (see editorParagraphsToGmailLines). Lexical drops a lone <br> in a <div>,
 * which would lose blank lines on reopening, so each line div becomes a <p>.
 */
function linesToParagraphs(dom: Document): void {
  for (const div of Array.from(dom.body.querySelectorAll('div'))) {
    if (div.querySelector(BLOCK_SELECTOR)) continue
    const paragraph = dom.createElement('p')
    for (const name of ['dir', 'style']) {
      const value = div.getAttribute(name)
      if (value !== null) paragraph.setAttribute(name, value)
    }
    paragraph.append(...Array.from(div.childNodes))
    div.replaceWith(paragraph)
  }
}

function $replaceWithHtml(editor: LexicalEditor, html: string): void {
  const root = $getRoot()
  root.clear()
  if (!html.trim()) {
    root.append($createParagraphNode())
    return
  }
  const dom = new DOMParser().parseFromString(html, 'text/html')
  linesToParagraphs(dom)
  const nodes = $generateNodesFromDOM(editor, dom)
  root.select()
  $insertNodes(nodes)
  if (root.getChildrenSize() === 0) root.append($createParagraphNode())
}

function cellText(node: LexicalNode): string {
  return node.getTextContent().replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim()
}

/** Serialise one top-level block for the AI prompt. */
function blockToMarkdown(node: LexicalNode): string {
  if ($isTableNode(node)) {
    const rows = node.getChildren().filter($isTableRowNode).map((row) => row.getChildren().filter($isTableCellNode).map(cellText))
    const width = Math.max(0, ...rows.map((row) => row.length))
    if (width === 0) return ''
    const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`
    const [head = [], ...body] = rows
    return [line(head), line(Array.from({ length: width }, () => '---')), ...body.map(line)].join('\n')
  }
  if ($isListNode(node)) {
    const ordered = node.getListType() === 'number'
    return node
      .getChildren()
      .filter($isListItemNode)
      .map((item, index) => `${ordered ? `${index + 1}.` : '-'} ${item.getTextContent().trim()}`)
      .join('\n')
  }
  return $isElementNode(node) ? node.getTextContent().trim() : ''
}

function $blocks(): EmailBlock[] {
  return $getRoot()
    .getChildren()
    .map((node) => ({ key: node.getKey(), markdown: blockToMarkdown(node) }))
    .filter((block) => block.markdown !== '')
}

/** An empty line: a paragraph with no text or images, only line breaks. */
function $isEmptyLine(node: LexicalNode | null): boolean {
  return (
    $isParagraphNode(node) &&
    node.getChildren().every((child) => $isLineBreakNode(child) || ($isTextNode(child) && child.getTextContent().trim() === ''))
  )
}

/** Editor blocks for AI text, with a blank line kept as an empty paragraph (each paragraph is one line). */
function $nodesFromMarkdown(editor: LexicalEditor, text: string): LexicalNode[] {
  const dom = new DOMParser().parseFromString(markdownLiteToBlocksHtml(text, { blankLines: true }), 'text/html')
  const out: LexicalNode[] = []
  let paragraph: ReturnType<typeof $createParagraphNode> | null = null
  for (const node of $generateNodesFromDOM(editor, dom)) {
    if ($isElementNode(node) && !node.isInline()) {
      paragraph = null
      out.push(node)
      continue
    }
    // The body can only hold blocks: stray inline content goes in a paragraph.
    if (!paragraph) {
      paragraph = $createParagraphNode()
      out.push(paragraph)
    }
    paragraph.append(node)
  }
  return out
}

function insertAllAfter(anchor: LexicalNode, nodes: LexicalNode[]): LexicalNode {
  let at = anchor
  for (const node of nodes) {
    at.insertAfter(node)
    at = node
  }
  return at
}

/**
 * Apply AI edits to the blocks with these keys (1-based in the edits). New
 * blocks follow the spacing around them: after a block followed by an empty
 * line they get one too; in tightly stacked lines they do not.
 */
function $applyBlockEdits(editor: LexicalEditor, keys: string[], edits: BlockEdit[]): void {
  const nodes = keys.map((key) => $getNodeByKey(key)).filter((node): node is LexicalNode => node !== null)
  const plan = planBlockEdits(nodes.length, edits)
  const spaced = (node: LexicalNode): boolean => {
    const next = node.getNextSibling()
    if (next) return $isEmptyLine(next)
    return $isEmptyLine(node.getPreviousSibling())
  }

  const first = nodes[0]
  if (first) {
    const gap = spaced(first)
    for (const text of plan.insertAfter[0] ?? []) {
      for (const node of $nodesFromMarkdown(editor, text)) first.insertBefore(node)
      if (gap) first.insertBefore($createParagraphNode())
    }
  }

  nodes.forEach((node, index) => {
    const gap = spaced(node)
    const inserts = [...(plan.insertAfter[index + 1] ?? [])]
    let change = plan.change[index]
    // Deleting a block and adding one after it is replacing it.
    if (change === null && inserts.length > 0) change = inserts.shift()
    let anchor: LexicalNode = node
    if (typeof change === 'string') anchor = insertAllAfter(node, $nodesFromMarkdown(editor, change))
    for (const text of inserts) {
      const created = $nodesFromMarkdown(editor, text)
      anchor = insertAllAfter(anchor, gap ? [$createParagraphNode(), ...created] : created)
    }
    if (change === undefined) return
    if (anchor === node) {
      // Removed with nothing in its place: drop one neighbouring empty line too, so no double gap is left.
      const next = node.getNextSibling()
      const previous = node.getPreviousSibling()
      if (next && $isEmptyLine(next)) next.remove()
      else if (!next && previous && $isEmptyLine(previous)) previous.remove()
    }
    node.remove()
  })
  const root = $getRoot()
  if (root.getChildrenSize() === 0) root.append($createParagraphNode())
}

/** A one-line paragraph whose text is all bold: a section label such as "Month by month". */
function $isSectionLabel(node: LexicalNode): boolean {
  if (!$isParagraphNode(node)) return false
  const text = node.getTextContent().trim()
  if (!text || text.length > MAX_SECTION_LABEL_CHARS || text.includes('\n')) return false
  const texts = node.getAllTextNodes().filter((child) => child.getTextContent().trim() !== '')
  return texts.length > 0 && texts.every((child) => child.hasFormat('bold'))
}

/** Size each column of a table to its text (cells spanning columns are left alone). */
function $sizeTableColumns(table: LexicalNode, measure: MeasureText): boolean {
  if (!$isTableNode(table)) return false
  const rows = table.getChildren().filter($isTableRowNode).map((row) => row.getChildren().filter($isTableCellNode))
  if (rows.some((row) => row.some((cell) => cell.getColSpan() > 1 || cell.getRowSpan() > 1))) return false
  const count = Math.max(0, ...rows.map((row) => row.length))
  const columns: MeasuredCell[][] = Array.from({ length: count }, (_, index) =>
    rows.flatMap((row) => {
      const cell = row[index]
      if (!cell) return []
      const texts = cell.getAllTextNodes().filter((child) => child.getTextContent().trim() !== '')
      const bold = cell.hasHeader() || (texts.length > 0 && texts.every((child) => child.hasFormat('bold')))
      return [{ lines: cell.getChildren().flatMap((child) => child.getTextContent().split('\n')), bold }]
    }),
  )
  const widths = columnWidths(columns, measure)
  let changed = false
  const current = table.getColWidths()
  if (!current || current.length !== widths.length || current.some((width, index) => width !== widths[index])) {
    table.setColWidths(widths)
    changed = true
  }
  for (const row of rows) {
    row.forEach((cell, index) => {
      if (cell.getWidth() !== widths[index]) {
        cell.setWidth(widths[index])
        changed = true
      }
    })
  }
  return changed
}

/** See RichEmailEditorHandle.tidyLayout. True when anything changed. */
function $tidyLayout(measure: MeasureText): boolean {
  let changed = false
  const ensureEmptyLineBefore = (node: LexicalNode) => {
    const previous = node.getPreviousSibling()
    if (!previous || $isEmptyLine(previous)) return
    node.insertBefore($createParagraphNode())
    changed = true
  }
  const ensureEmptyLineAfter = (node: LexicalNode) => {
    const next = node.getNextSibling()
    // Nothing after it: the signature already gets its own blank line.
    if (!next || $isEmptyLine(next)) return
    node.insertAfter($createParagraphNode())
    changed = true
  }

  const blocks = $getRoot().getChildren()
  const greeting = blocks.find((node) => !$isEmptyLine(node))
  if (greeting && $isParagraphNode(greeting) && isGreetingLine(greeting.getTextContent())) ensureEmptyLineAfter(greeting)
  for (const node of blocks) {
    if ($isTableNode(node)) {
      if ($sizeTableColumns(node, measure)) changed = true
      ensureEmptyLineAfter(node)
    } else if ($isParagraphNode(node) && node !== greeting && (isTldrLine(node.getTextContent()) || $isSectionLabel(node))) {
      ensureEmptyLineBefore(node)
    }
  }
  return changed
}

/**
 * Measures text in the body's font with a hidden element outside the editor;
 * falls back to an estimate where the browser does not lay text out (tests).
 */
function createTextMeasurer(root: HTMLElement | null): { measure: MeasureText; dispose: () => void } {
  const probe = document.createElement('span')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;white-space:pre'
  const style = root ? window.getComputedStyle(root) : null
  probe.style.fontFamily = style?.fontFamily || 'Verdana, sans-serif'
  probe.style.fontSize = style?.fontSize || 'small'
  document.body.append(probe)
  return {
    measure: (text, bold) => {
      probe.style.fontWeight = bold ? '700' : '400'
      probe.textContent = text
      const width = probe.getBoundingClientRect().width
      return width > 0 ? width : estimateTextWidth(text, bold)
    },
    dispose: () => probe.remove(),
  }
}

/** How close (px) to a cell's right edge the pointer must be to resize its column. */
const RESIZE_EDGE_PX = 5
/** Matches the editor's cell min-width (ComposeWindow.module.css .editorTableCell). */
const MIN_RESIZE_COLUMN_PX = 60

/** The table cell whose right edge is under the pointer, or null. */
function resizeEdgeCell(event: PointerEvent): HTMLTableCellElement | null {
  const target = event.target instanceof Element ? event.target : null
  const cell = target?.closest('td, th')
  if (!(cell instanceof HTMLTableCellElement)) return null
  const fromEdge = cell.getBoundingClientRect().right - event.clientX
  return fromEdge >= -2 && fromEdge <= RESIZE_EDGE_PX ? cell : null
}

/**
 * Drag a column's right edge to make it wider or narrower (tables are only
 * resized, never moved). On release every column is fixed at the width it
 * shows, the dragged one at its new width, on the table and each cell, so the
 * sent email matches the editor. It is one editor change, so Cmd/Ctrl+Z
 * undoes it. Tables with merged cells are left alone.
 */
function TableColumnResizePlugin() {
  const [editor] = useLexicalComposerContext()
  useEffect(
    () =>
      editor.registerRootListener((root, previous) => {
        const cleanups: Array<() => void> = []
        if (previous) previous.style.cursor = ''
        if (!root) return
        let drag: { cell: HTMLTableCellElement; table: HTMLTableElement; startX: number; widths: number[]; column: number } | null = null

        const preview = (widths: number[]) => {
          if (!drag) return
          for (const row of Array.from(drag.table.rows)) {
            Array.from(row.cells).forEach((cell, index) => {
              const width = widths[index]
              if (width) cell.style.width = `${width}px`
            })
          }
          Array.from(drag.table.querySelectorAll(':scope > colgroup > col')).forEach((col, index) => {
            const width = widths[index]
            if (width && col instanceof HTMLElement) col.style.width = `${width}px`
          })
        }
        const onMove = (event: PointerEvent) => {
          if (drag) {
            const widths = [...drag.widths]
            widths[drag.column] = Math.max(MIN_RESIZE_COLUMN_PX, Math.round((drag.widths[drag.column] ?? 0) + event.clientX - drag.startX))
            preview(widths)
            return
          }
          root.style.cursor = resizeEdgeCell(event) ? 'col-resize' : ''
        }
        const onDown = (event: PointerEvent) => {
          if (event.button !== 0 || !editor.isEditable()) return
          const cell = resizeEdgeCell(event)
          const table = cell?.closest('table')
          if (!cell || !table) return
          const rows = Array.from(table.rows)
          if (rows.some((row) => Array.from(row.cells).some((c) => c.colSpan > 1 || c.rowSpan > 1))) return
          event.preventDefault()
          const first = rows[0]
          drag = {
            cell,
            table,
            startX: event.clientX,
            column: cell.cellIndex,
            widths: first ? Array.from(first.cells).map((c) => Math.round(c.getBoundingClientRect().width)) : [],
          }
          root.setPointerCapture?.(event.pointerId)
        }
        const onUp = (event: PointerEvent) => {
          if (!drag) return
          const { cell, column, startX } = drag
          const widths = [...drag.widths]
          widths[column] = Math.max(MIN_RESIZE_COLUMN_PX, Math.round((widths[column] ?? 0) + event.clientX - startX))
          drag = null
          root.releasePointerCapture?.(event.pointerId)
          root.style.cursor = ''
          editor.update(() => {
            const table = $getNearestNodeFromDOMNode(cell)?.getParents().find($isTableNode)
            if (!table) return
            table.setColWidths(widths)
            for (const row of table.getChildren().filter($isTableRowNode)) {
              row.getChildren().filter($isTableCellNode).forEach((node, index) => {
                const width = widths[index]
                if (width && node.getWidth() !== width) node.setWidth(width)
              })
            }
          })
        }
        root.addEventListener('pointermove', onMove)
        root.addEventListener('pointerdown', onDown)
        root.addEventListener('pointerup', onUp)
        root.addEventListener('pointercancel', onUp)
        cleanups.push(() => {
          root.removeEventListener('pointermove', onMove)
          root.removeEventListener('pointerdown', onDown)
          root.removeEventListener('pointerup', onUp)
          root.removeEventListener('pointercancel', onUp)
        })
        return () => cleanups.forEach((cleanup) => cleanup())
      }),
    [editor],
  )
  return null
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

function visibleText(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? ''
}

/**
 * Files to paste instead of the clipboard's HTML/text: only when it holds an
 * image and the HTML/text adds no words (otherwise, e.g. a table copied from
 * Excel, which also carries a picture of itself, the HTML is pasted).
 */
export function clipboardImageFiles(data: Pick<DataTransfer, 'files' | 'getData'>): File[] | null {
  const files = Array.from(data.files)
  if (!files.some((file) => IMAGE_TYPES.has(file.type))) return null
  const html = data.getData('text/html')
  const text = (html ? visibleText(html) : data.getData('text/plain')).trim()
  if (text === '' || files.some((file) => file.name === text)) return files
  return null
}

function EditorBridge({
  handleRef,
  initialHtml,
  onPasteFiles,
  onFormatChange,
  pasteSelectionRef,
}: {
  handleRef: React.MutableRefObject<LexicalEditor | null>
  initialHtml: string
  onPasteFiles: (files: File[]) => void
  onFormatChange?: (format: EmailSelectionFormat) => void
  pasteSelectionRef: React.MutableRefObject<BaseSelection | null>
}) {
  const [editor] = useLexicalComposerContext()
  const pasteRef = useRef(onPasteFiles)
  pasteRef.current = onPasteFiles
  const formatRef = useRef(onFormatChange)
  formatRef.current = onFormatChange

  // Inline code would render in a monospace font; the body only ever uses one font.
  useEffect(
    () =>
      editor.registerNodeTransform(TextNode, (node) => {
        if (node.hasFormat('code')) node.toggleFormat('code')
      }),
    [editor],
  )

  useEffect(() => {
    let last = ''
    return editor.registerUpdateListener(({ editorState }) => {
      const format = editorState.read($selectionFormat, { editor })
      const key = `${format.list ?? ''}|${format.color ?? ''}`
      if (key === last) return
      last = key
      formatRef.current?.(format)
    })
  }, [editor])

  useEffect(() => {
    handleRef.current = editor
    editor.update(() => $replaceWithHtml(editor, initialHtml))
    return () => {
      handleRef.current = null
    }
    // initialHtml is only the starting content; later changes go through setHtml.
  }, [editor])

  useEffect(() => {
    // Images are read and resized asynchronously; remember where the cursor was so they land there.
    const pasteFiles = (files: File[]) => {
      const selection = $getSelection()
      pasteSelectionRef.current = selection ? selection.clone() : null
      pasteRef.current(files)
    }
    const offPaste = editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        const data = 'clipboardData' in event ? event.clipboardData : null
        const files = data ? clipboardImageFiles(data) : null
        if (!files) {
          // Plain text is typed in with the cursor's style, so make that black.
          // HTML and Lexical copies are recoloured below as they're inserted.
          const selection = $getSelection()
          if (data && isPlainTextPaste(data) && $isRangeSelection(selection)) {
            selection.setStyle(styleWithColor(selection.style, PASTE_TEXT_COLOR))
          }
          return false
        }
        event.preventDefault()
        pasteFiles(files)
        return true
      },
      COMMAND_PRIORITY_HIGH,
    )
    // Rich pastes hand exactly the new nodes to this command before inserting
    // them (tables included), so only pasted text is recoloured. Returns false
    // so the table plugin or Lexical still does the insert.
    const offPastedNodes = editor.registerCommand(
      SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
      ({ nodes }) => {
        if ($hasUpdateTag(PASTE_TAG)) $colorPastedNodes(nodes, PASTE_TEXT_COLOR)
        return false
      },
      COMMAND_PRIORITY_HIGH,
    )
    const offFiles = editor.registerCommand(
      DRAG_DROP_PASTE,
      (files) => {
        pasteFiles(Array.from(files))
        return true
      },
      COMMAND_PRIORITY_LOW,
    )
    // Dropped files become attachments: the compose window's drop handler takes them.
    const offDrop = editor.registerCommand(
      DROP_COMMAND,
      (event) => {
        if ((event.dataTransfer?.files.length ?? 0) === 0) return false
        event.preventDefault()
        return true
      },
      COMMAND_PRIORITY_HIGH,
    )
    return () => {
      offPaste()
      offPastedNodes()
      offFiles()
      offDrop()
    }
  }, [editor, pasteSelectionRef])
  return null
}

const RichEmailEditor = forwardRef<RichEmailEditorHandle, Props>(function RichEmailEditor(
  { initialHtml, placeholder, ariaLabel, onContentChange, onPasteFiles, onFormatChange },
  ref,
) {
  const editorRef = useRef<LexicalEditor | null>(null)
  const pasteSelectionRef = useRef<BaseSelection | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      getHtml: () => {
        const editor = editorRef.current
        return editor ? editor.getEditorState().read(() => $generateHtmlFromNodes(editor, null), { editor }) : ''
      },
      getMarkdown: () => {
        const editor = editorRef.current
        if (!editor) return ''
        return editor.getEditorState().read(() => $blocks().map((block) => block.markdown).join('\n\n'), { editor })
      },
      getBlocks: () => {
        const editor = editorRef.current
        return editor ? editor.getEditorState().read($blocks, { editor }) : []
      },
      applyBlockEdits: (keys, edits) => {
        const editor = editorRef.current
        if (!editor) return false
        const present = editor
          .getEditorState()
          .read(() => keys.every((key) => $getNodeByKey(key)?.getParent()?.getKey() === 'root'), { editor })
        if (!present) return false
        // discrete: committed now, so the body can be read straight after.
        editor.update(() => $applyBlockEdits(editor, keys, edits), { discrete: true })
        return true
      },
      tidyLayout: () => {
        const editor = editorRef.current
        if (!editor) return false
        const measurer = createTextMeasurer(editor.getRootElement())
        let changed = false
        try {
          editor.update(
            () => {
              changed = $tidyLayout(measurer.measure)
            },
            { discrete: true },
          )
        } finally {
          measurer.dispose()
        }
        return changed
      },
      snapshot: () => editorRef.current?.getEditorState() ?? null,
      restore: (snapshot) => {
        editorRef.current?.setEditorState(snapshot)
      },
      setHtml: (html) => {
        const editor = editorRef.current
        editor?.update(() => $replaceWithHtml(editor, html))
      },
      insertTable: (rows, columns) => {
        editorRef.current?.dispatchCommand(INSERT_TABLE_COMMAND, {
          rows: String(rows),
          columns: String(columns),
          includeHeaders: { rows: true, columns: false },
        })
      },
      insertImage: (src, alt, width) => {
        editorRef.current?.update(() => {
          // A pasted image goes where the cursor was at paste time, even if focus moved since.
          const saved = pasteSelectionRef.current
          pasteSelectionRef.current = null
          // Only if both ends still exist; otherwise insert at the current position.
          if (
            $isRangeSelection(saved) &&
            !$isRangeSelection($getSelection()) &&
            $getNodeByKey(saved.anchor.key) &&
            $getNodeByKey(saved.focus.key)
          ) {
            $setSelection(saved)
          }
          $insertNodes([$createEmailImageNode(src, alt, width)])
        })
      },
      setTextColor: (color) => {
        const safe = color === null ? null : safeColor(color)
        if (color !== null && !safe) return
        editorRef.current?.update(() => $setTextColor(safe))
      },
      toggleList: (type) => {
        const editor = editorRef.current
        if (!editor) return
        const current = editor.getEditorState().read(() => $selectionFormat().list, { editor })
        if (current === type) {
          editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
          return
        }
        editor.update(() => {
          $splitSelectedLines()
          $insertList(type)
        })
      },
      focus: () => editorRef.current?.focus(),
    }),
    [],
  )

  const onChange = (state: EditorState) => {
    state.read(() => {
      const hasText = $getRoot().getTextContent().trim().length > 0
      onContentChange(hasText || $nodesOfType(EmailImageNode).length > 0)
    })
  }

  return (
    <LexicalComposer
      initialConfig={{
        namespace: 'mail-compose',
        theme,
        nodes: [ListNode, ListItemNode, TableNode, TableRowNode, TableCellNode, LinkNode, EmailImageNode],
        html: { import: colorImport, export: tableCellExport },
        onError: (error) => {
          console.error('[mail-editor]', error.message)
        },
      }}
    >
      <div className={styles.editorShell}>
        <RichTextPlugin
          contentEditable={<ContentEditable className={styles.body} aria-label={ariaLabel} />}
          placeholder={<div className={styles.editorPlaceholder}>{placeholder}</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
      <HistoryPlugin />
      <ListPlugin />
      <MarkdownShortcutPlugin transformers={LIST_SHORTCUTS} />
      <TablePlugin />
      <TableColumnResizePlugin />
      <LinkPlugin />
      <EmailLinkPlugin />
      <OnChangePlugin onChange={onChange} ignoreSelectionChange />
      <EditorBridge
        handleRef={editorRef}
        initialHtml={initialHtml}
        onPasteFiles={onPasteFiles}
        onFormatChange={onFormatChange}
        pasteSelectionRef={pasteSelectionRef}
      />
    </LexicalComposer>
  )
})

export default RichEmailEditor
