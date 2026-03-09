'use client'

import { createClientFeature } from '@payloadcms/richtext-lexical/client'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  PASTE_COMMAND,
  COMMAND_PRIORITY_HIGH,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $createTextNode,
} from 'lexical'
import { $createListNode, $createListItemNode } from '@lexical/list'
import { useEffect } from 'react'

/**
 * Lexical plugin that intercepts paste events and converts
 * markdown-style lists into proper Lexical list nodes.
 *
 * Handles:
 * - "- item" and "* item" -> unordered list
 * - "1. item", "2. item" etc -> ordered list
 *
 * Mixed content (lists + paragraphs) is handled correctly.
 */
function MarkdownPastePlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        if (!(event instanceof ClipboardEvent)) return false

        const clipboardData = event.clipboardData
        if (!clipboardData) return false

        // Only intercept plain text paste (not HTML which Lexical handles natively)
        if (clipboardData.types.includes('text/html')) return false

        const text = clipboardData.getData('text/plain')
        if (!text) return false

        const lines = text.split('\n')

        // Check if any lines are markdown-style list items
        const hasListItems = lines.some(
          (line) => /^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line),
        )

        if (!hasListItems) return false

        // Prevent default paste
        event.preventDefault()

        editor.update(() => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return

          type Block =
            | { type: 'ul'; items: string[] }
            | { type: 'ol'; items: string[] }
            | { type: 'paragraph'; text: string }

          const blocks: Block[] = []
          let currentList: Block | null = null

          for (const line of lines) {
            const ulMatch = line.match(/^\s*[-*]\s+(.*)/)
            const olMatch = line.match(/^\s*\d+\.\s+(.*)/)

            if (ulMatch) {
              if (currentList && currentList.type === 'ul') {
                currentList.items.push(ulMatch[1])
              } else {
                currentList = { type: 'ul', items: [ulMatch[1]] }
                blocks.push(currentList)
              }
            } else if (olMatch) {
              if (currentList && currentList.type === 'ol') {
                currentList.items.push(olMatch[1])
              } else {
                currentList = { type: 'ol', items: [olMatch[1]] }
                blocks.push(currentList)
              }
            } else {
              currentList = null
              const trimmed = line.trim()
              if (trimmed) {
                blocks.push({ type: 'paragraph', text: trimmed })
              }
            }
          }

          if (blocks.length === 0) return

          // Build nodes
          const nodes = blocks.map((block) => {
            if (block.type === 'ul' || block.type === 'ol') {
              const listType = block.type === 'ul' ? 'bullet' : 'number'
              const listNode = $createListNode(listType)
              for (const item of block.items) {
                const listItemNode = $createListItemNode()
                listItemNode.append($createTextNode(item))
                listNode.append(listItemNode)
              }
              return listNode
            }
            const p = $createParagraphNode()
            p.append($createTextNode(block.text))
            return p
          })

          // Replace selection with the new nodes
          selection.insertNodes(nodes)
        })

        return true
      },
      COMMAND_PRIORITY_HIGH,
    )
  }, [editor])

  return null
}

export const MarkdownPasteFeatureClient = createClientFeature({
  plugins: [
    {
      Component: MarkdownPastePlugin,
      position: 'normal',
    },
  ],
})
