'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import {
  $createParagraphNode,
  $getRoot,
  $insertNodes,
  $isElementNode,
  $nodesOfType,
  COMMAND_PRIORITY_LOW,
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
import { $isListItemNode, $isListNode, ListItemNode, ListNode } from '@lexical/list'
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
 * - Bold / italic / underline: Cmd/Ctrl+B, I, U (Lexical's built-in shortcuts;
 *   there are deliberately no toolbar buttons for them).
 * - Tables: pasted tables (Sheets, Excel, Docs, web pages) are kept, and
 *   insertTable() adds an empty one. Copying out of the editor gives HTML
 *   tables other apps understand.
 * - Images: pasted image files and images in pasted HTML are shown inline
 *   (see EmailImageNode). Pasted non-image files go to onPasteFiles so the
 *   compose window can attach them.
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
  focus: () => void
}

interface Props {
  initialHtml: string
  placeholder: string
  ariaLabel: string
  onContentChange: (hasContent: boolean) => void
  onPasteFiles: (files: File[]) => void
}

const theme = {
  paragraph: styles.editorParagraph,
  text: { bold: styles.textBold, italic: styles.textItalic, underline: styles.textUnderline },
  table: styles.editorTable,
  tableCell: styles.editorTableCell,
  tableCellHeader: styles.editorTableHeader,
  list: { ul: styles.editorList, ol: styles.editorList },
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

function EditorBridge({
  handleRef,
  initialHtml,
  onPasteFiles,
}: {
  handleRef: React.MutableRefObject<LexicalEditor | null>
  initialHtml: string
  onPasteFiles: (files: File[]) => void
}) {
  const [editor] = useLexicalComposerContext()
  const pasteRef = useRef(onPasteFiles)
  pasteRef.current = onPasteFiles

  useEffect(() => {
    handleRef.current = editor
    editor.update(() => $replaceWithHtml(editor, initialHtml))
    return () => {
      handleRef.current = null
    }
    // initialHtml is only the starting content; later changes go through setHtml.
  }, [editor])

  useEffect(
    () =>
      editor.registerCommand(
        DRAG_DROP_PASTE,
        (files) => {
          pasteRef.current(Array.from(files))
          return true
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor],
  )
  return null
}

const RichEmailEditor = forwardRef<RichEmailEditorHandle, Props>(function RichEmailEditor(
  { initialHtml, placeholder, ariaLabel, onContentChange, onPasteFiles },
  ref,
) {
  const editorRef = useRef<LexicalEditor | null>(null)

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
          $insertNodes([$createEmailImageNode(src, alt, width)])
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
        nodes: [ListNode, ListItemNode, TableNode, TableRowNode, TableCellNode, EmailImageNode],
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
      <EditorBridge handleRef={editorRef} initialHtml={initialHtml} onPasteFiles={onPasteFiles} />
    </LexicalComposer>
  )
})

export default RichEmailEditor
