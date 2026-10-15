'use client'

import type { JSX } from 'react'
import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical'

/**
 * An image inside the Mail editor's body. Pasted/inserted images are held as
 * data: URLs (turned into cid: inline parts when the email is sent, see
 * src/lib/mail/compose-html.ts); images pasted from web pages keep their
 * https URL. Any other src (javascript:, http:, other data: types) is dropped.
 */

const SAFE_SRC_RE = /^(https:\/\/|data:image\/(png|jpeg|gif|webp);base64,)/i
const MAX_WIDTH = 2000

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

  decorate(): JSX.Element {
    return (
      <img
        src={this.__src}
        alt={this.__alt}
        width={this.__width ?? undefined}
        draggable={false}
        style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
      />
    )
  }
}

export function $createEmailImageNode(src: string, alt: string, width: number | null): EmailImageNode {
  return $applyNodeReplacement(new EmailImageNode(src, alt, width))
}

export function $isEmailImageNode(node: LexicalNode | null | undefined): node is EmailImageNode {
  return node instanceof EmailImageNode
}
