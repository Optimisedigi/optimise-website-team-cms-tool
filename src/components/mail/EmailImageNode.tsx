'use client'

import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import {
  $applyNodeReplacement,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  DecoratorNode,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  mergeRegister,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical'
import styles from './ComposeWindow.module.css'

/**
 * An image inside the Mail editor's body. Pasted/inserted images are held as
 * data: URLs (turned into cid: inline parts when the email is sent, see
 * src/lib/mail/compose-html.ts); images pasted from web pages keep their
 * https URL. Any other src (javascript:, http:, other data: types) is dropped.
 *
 * Click an image to select it; drag the corner handle to resize it (the
 * width is kept, height follows the aspect ratio) and Delete/Backspace
 * removes it.
 */

const SAFE_SRC_RE = /^(https:\/\/|data:image\/(png|jpeg|gif|webp);base64,)/i
const MAX_WIDTH = 2000
/** Smallest width the resize handle allows. */
export const MIN_IMAGE_WIDTH = 40

/** Width while dragging the handle: never narrower than the minimum or wider than the body. */
export function clampImageWidth(width: number, maxWidth: number): number {
  const max = Math.max(MIN_IMAGE_WIDTH, Math.min(maxWidth, MAX_WIDTH))
  return Math.round(Math.min(Math.max(width, MIN_IMAGE_WIDTH), max))
}

function EmailImageView({ nodeKey, src, alt, width }: { nodeKey: NodeKey; src: string; alt: string; width: number | null }) {
  const [editor] = useLexicalComposerContext()
  const [isSelected, setSelected, clearSelection] = useLexicalNodeSelection(nodeKey)
  const imgRef = useRef<HTMLImageElement>(null)
  // Width while the handle is dragged; written to the node on release (one undo step).
  const [dragWidth, setDragWidth] = useState<number | null>(null)

  const removeIfSelected = useCallback(
    (event: KeyboardEvent | null) => {
      const selection = $getSelection()
      if (!isSelected || !$isNodeSelection(selection)) return false
      event?.preventDefault()
      const node = $getNodeByKey(nodeKey)
      if ($isEmailImageNode(node)) node.remove()
      return true
    },
    [isSelected, nodeKey],
  )

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          CLICK_COMMAND,
          (event) => {
            if (event.target !== imgRef.current) return false
            if (!event.shiftKey) clearSelection()
            setSelected(true)
            return true
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(KEY_DELETE_COMMAND, removeIfSelected, COMMAND_PRIORITY_LOW),
        editor.registerCommand(KEY_BACKSPACE_COMMAND, removeIfSelected, COMMAND_PRIORITY_LOW),
      ),
    [editor, clearSelection, setSelected, removeIfSelected],
  )

  const startResize = (event: React.PointerEvent<HTMLSpanElement>) => {
    const img = imgRef.current
    if (!img) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = img.getBoundingClientRect().width
    const root = editor.getRootElement()
    // The body's content width (padding excluded), so an image can't be dragged wider than the email.
    const rootStyle = root ? window.getComputedStyle(root) : null
    const padding = rootStyle ? Number.parseFloat(rootStyle.paddingLeft) + Number.parseFloat(rootStyle.paddingRight) : 0
    const maxWidth = root && root.clientWidth > 0 ? root.clientWidth - (Number.isFinite(padding) ? padding : 0) : MAX_WIDTH
    let latest = startWidth
    const move = (e: PointerEvent) => {
      latest = clampImageWidth(startWidth + (e.clientX - startX), maxWidth)
      setDragWidth(latest)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setDragWidth(null)
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isEmailImageNode(node)) node.setWidth(clampImageWidth(latest, maxWidth))
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const shownWidth = dragWidth ?? width
  return (
    <span className={`${styles.imageFrame} ${isSelected ? styles.imageSelected : ''}`}>
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        width={shownWidth ?? undefined}
        draggable={false}
        style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
      />
      {isSelected && editor.isEditable() ? (
        <span
          className={styles.imageHandle}
          role="presentation"
          title="Drag to resize"
          onPointerDown={startResize}
        />
      ) : null}
    </span>
  )
}

export type SerializedEmailImageNode = Spread<
  { src: string; alt: string; width: number | null },
  SerializedLexicalNode
>

export function isSafeEmailImageSrc(src: string): boolean {
  return SAFE_SRC_RE.test(src.trim())
}

function parseWidth(value: string | null): number | null {
  const width = Number.parseInt(value ?? '', 10)
  return Number.isFinite(width) && width > 0 ? Math.min(width, MAX_WIDTH) : null
}

function convertImageElement(domNode: HTMLElement): DOMConversionOutput {
  const src = domNode.getAttribute('src') ?? ''
  if (!isSafeEmailImageSrc(src)) return { node: null }
  return {
    node: $createEmailImageNode(src.trim(), domNode.getAttribute('alt') ?? '', parseWidth(domNode.getAttribute('width'))),
  }
}

export class EmailImageNode extends DecoratorNode<JSX.Element> {
  __src: string
  __alt: string
  __width: number | null

  static getType(): string {
    return 'email-image'
  }

  static clone(node: EmailImageNode): EmailImageNode {
    return new EmailImageNode(node.__src, node.__alt, node.__width, node.__key)
  }

  constructor(src: string, alt: string, width: number | null, key?: NodeKey) {
    super(key)
    this.__src = src
    this.__alt = alt
    this.__width = width
  }

  static importJSON(serialized: SerializedEmailImageNode): EmailImageNode {
    return $createEmailImageNode(serialized.src, serialized.alt, serialized.width)
  }

  exportJSON(): SerializedEmailImageNode {
    return { ...super.exportJSON(), type: 'email-image', version: 1, src: this.__src, alt: this.__alt, width: this.__width }
  }

  static importDOM(): DOMConversionMap | null {
    return { img: () => ({ conversion: convertImageElement, priority: 0 }) }
  }

  exportDOM(): DOMExportOutput {
    const img = document.createElement('img')
    // src first: compose-html.ts matches `src="data:..."` in this output.
    img.setAttribute('src', this.__src)
    img.setAttribute('alt', this.__alt)
    if (this.__width) img.setAttribute('width', String(this.__width))
    img.setAttribute('style', 'max-width:100%;height:auto;')
    return { element: img }
  }

  createDOM(): HTMLElement {
    const span = document.createElement('span')
    span.style.display = 'inline-block'
    span.style.maxWidth = '100%'
    return span
  }

  updateDOM(): false {
    return false
  }

  isInline(): boolean {
    return true
  }

  getSrc(): string {
    return this.getLatest().__src
  }

  getWidth(): number | null {
    return this.getLatest().__width
  }

  setWidth(width: number | null): this {
    const writable = this.getWritable()
    writable.__width = width === null ? null : Math.min(Math.max(Math.round(width), 1), MAX_WIDTH)
    return writable
  }

  decorate(): JSX.Element {
    return <EmailImageView nodeKey={this.getKey()} src={this.__src} alt={this.__alt} width={this.__width} />
  }
}

export function $createEmailImageNode(src: string, alt: string, width: number | null): EmailImageNode {
  return $applyNodeReplacement(new EmailImageNode(src, alt, width))
}

export function $isEmailImageNode(node: LexicalNode | null | undefined): node is EmailImageNode {
  return node instanceof EmailImageNode
}
