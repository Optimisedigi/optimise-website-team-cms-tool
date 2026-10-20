'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $nodesOfType,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  DROP_COMMAND,
  PASTE_COMMAND,
  TextNode,
  type BaseSelection,
  type DOMConversionMap,
  type DOMConversionOutput,
  type EditorState,
  type LexicalEditor,
  type LexicalNode,
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
import { DRAG_DROP_PASTE } from '@lexical/rich-text'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import {
  $isListItemNode,
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
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
import { $createEmailImageNode, EmailImageNode } from './EmailImageNode'
import styles from './ComposeWindow.module.css'

/**
 * Rich email body for the Mail compose window, built on Lexical.
 *
 * - One font, always: the body is Verdana at Gmail's "Normal" size (CSS
 *   `small`) and cannot be changed. Pasted text keeps bold, italic,
 *   underline, lists, tables and colour, but never its font or size (Lexical
 *   does not import them, and inline code is turned back into plain text).
 * - Bold / italic / underline: Cmd/Ctrl+B, I, U (Lexical's built-in shortcuts;
 *   there are deliberately no toolbar buttons for them).
 * - Text colour, bulleted and numbered lists: setTextColor() and toggleList(),
 *   driven by the compose window's formatting bar.
 * - Tables: pasted tables (Sheets, Excel, Docs, web pages) are kept, and
 *   insertTable() adds an empty one. Copying out of the editor gives HTML
 *   tables other apps understand.
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

/**
 * Keep pasted/loaded text colour. Lexical's own <span> import only reads bold,
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

function $replaceWithHtml(editor: LexicalEditor, html: string): void {
  const root = $getRoot()
  root.clear()
  if (!html.trim()) {
    root.append($createParagraphNode())
    return
  }
  const dom = new DOMParser().parseFromString(html, 'text/html')
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
        if (!files) return false
        event.preventDefault()
        pasteFiles(files)
        return true
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
        return editor.getEditorState().read(
          () =>
            $getRoot()
              .getChildren()
              .map(blockToMarkdown)
              .filter((block) => block !== '')
              .join('\n\n'),
          { editor },
        )
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
        if (current === type) editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
        else editor.dispatchCommand(type === 'number' ? INSERT_ORDERED_LIST_COMMAND : INSERT_UNORDERED_LIST_COMMAND, undefined)
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
        nodes: [ListNode, ListItemNode, TableNode, TableRowNode, TableCellNode, EmailImageNode],
        html: { import: colorImport },
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
      <TablePlugin />
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
