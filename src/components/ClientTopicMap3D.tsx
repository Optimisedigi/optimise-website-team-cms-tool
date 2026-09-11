'use client'

import { useEffect, useRef, useState } from 'react'
import type { TopicGraphEdge, TopicGraphNode } from '@/lib/topic-authority-graph'

/**
 * Compact 3D force-directed view of the topical authority graph.
 *
 * The WebGL renderer and its three.js dependency are imported lazily so the
 * admin bundle stays unchanged until someone opens this view. The canvas is
 * decorative: the 2D graph and the relationships table remain the accessible
 * representations, so this subtree is hidden from assistive technology.
 */

/** Compact panel height. Keeps the graph inside the record view. */
const HEIGHT = 420
/**
 * Layout tuning. Distances are deliberately short: the upstream demo spreads
 * nodes across a whole screen, which reads as sprawl inside a CMS panel.
 */
const LINK_DISTANCE = 18
const CHARGE_STRENGTH = -48
const CHARGE_MAX_DISTANCE = 190
/** Settle quickly, then stop simulating so the panel stops burning CPU. */
const WARMUP_TICKS = 60
const COOLDOWN_TICKS = 140

type ForceNode = {
  id: string
  label: string
  type: TopicGraphNode['type']
  val: number
  color: string
}
type ForceLink = { source: string; target: string; type: TopicGraphEdge['type'] }

/** Palette fallbacks used when Payload's theme variables cannot be read. */
const FALLBACK: Record<string, string> = {
  category: '#111827',
  topic: '#2563eb',
  article: '#64748b',
  page: '#cbd5f5',
  published: '#475569',
  suggested: '#d97706',
  membership: '#cbd5e1',
  background: '#ffffff',
}

/**
 * Resolve a Payload theme variable to a concrete colour.
 *
 * Values are read from the live element so the graph follows light/dark mode
 * without duplicating the palette.
 */
function themeColor(styles: CSSStyleDeclaration, variable: string, fallback: string): string {
  const value = styles.getPropertyValue(variable).trim()
  return value || fallback
}

export default function ClientTopicMap3D({
  nodes,
  edges,
  selectedId,
  onSelect,
}: {
  nodes: TopicGraphNode[]
  edges: TopicGraphEdge[]
  selectedId?: string
  onSelect: (nodeId: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<any>(null)
  const selectRef = useRef(onSelect)
  const [failed, setFailed] = useState(false)
  // Flips once the lazy renderer exists, so the data effect re-runs and fills it.
  const [ready, setReady] = useState(false)

  // Keep the latest handler without tearing down the renderer on every render.
  useEffect(() => {
    selectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let instance: any = null
    let disposed = false
    let resizeObserver: ResizeObserver | null = null

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

    import('3d-force-graph')
      .then(({ default: ForceGraph3D }) => {
        if (disposed || !containerRef.current) return

        const styles = getComputedStyle(containerRef.current)
        const palette = {
          category: themeColor(styles, '--theme-elevation-800', FALLBACK.category),
          topic: themeColor(styles, '--theme-success-600', FALLBACK.topic),
          article: themeColor(styles, '--theme-elevation-500', FALLBACK.article),
          page: themeColor(styles, '--theme-elevation-250', FALLBACK.page),
          published: themeColor(styles, '--theme-elevation-650', FALLBACK.published),
          suggested: themeColor(styles, '--theme-warning-600', FALLBACK.suggested),
          membership: themeColor(styles, '--theme-elevation-200', FALLBACK.membership),
          background: themeColor(styles, '--theme-elevation-0', FALLBACK.background),
        }

        instance = new ForceGraph3D(containerRef.current, { controlType: 'orbit' })
        graphRef.current = instance

        instance
          .backgroundColor(palette.background)
          .showNavInfo(false)
          .nodeRelSize(2.6)
          .nodeOpacity(0.95)
          .nodeResolution(12)
          .nodeLabel((node: ForceNode) => `${node.label} — ${node.type}`)
          .nodeVal((node: ForceNode) => node.val)
          // Selection highlighting lives in its own effect, so this stays plain.
          .nodeColor((node: ForceNode) => node.color)
          .linkColor((link: ForceLink) =>
            link.type === 'suggested_link'
              ? palette.suggested
              : link.type === 'published_link'
                ? palette.published
                : palette.membership,
          )
          .linkWidth((link: ForceLink) => (link.type === 'published_link' ? 0.8 : 0.4))
          .linkOpacity(0.45)
          .linkDirectionalArrowLength((link: ForceLink) =>
            link.type === 'published_link' || link.type === 'suggested_link' ? 2.4 : 0,
          )
          .linkDirectionalArrowRelPos(1)
          .onNodeClick((node: ForceNode) => selectRef.current(node.id))
          .warmupTicks(reduceMotion ? COOLDOWN_TICKS : WARMUP_TICKS)
          .cooldownTicks(COOLDOWN_TICKS)
          .height(HEIGHT)
          .width(containerRef.current.clientWidth || 640)

        // Motion cue on recommendations only — bounded, and off when unwanted.
        if (!reduceMotion) {
          instance.linkDirectionalParticles((link: ForceLink) =>
            link.type === 'suggested_link' ? 2 : 0,
          )
          instance.linkDirectionalParticleWidth(0.7)
        }

        instance.d3Force('link')?.distance(LINK_DISTANCE)
        instance.d3Force('charge')?.strength(CHARGE_STRENGTH).distanceMax(CHARGE_MAX_DISTANCE)

        // Frame the settled graph tightly so the panel reads as compact.
        instance.onEngineStop(() => instance?.zoomToFit(reduceMotion ? 0 : 400, 28))

        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width
            if (width) instance?.width(width)
          })
          resizeObserver.observe(containerRef.current)
        }

        setReady(true)
      })
      .catch(() => {
        if (!disposed) setFailed(true)
      })

    return () => {
      disposed = true
      setReady(false)
      resizeObserver?.disconnect()
      // Release the WebGL context; without this each toggle leaks a renderer.
      instance?._destructor?.()
      graphRef.current = null
    }
    // Built once: later prop changes are applied by the effects below, which
    // avoids resetting the camera on every filter or selection change.
  }, [])

  // Feed data separately so filter changes never tear down the renderer.
  useEffect(() => {
    const instance = graphRef.current
    if (!instance) return

    const styles = containerRef.current ? getComputedStyle(containerRef.current) : null
    const colorFor = (node: TopicGraphNode) => {
      if (!styles) return FALLBACK[node.type]
      if (node.type === 'category') return themeColor(styles, '--theme-elevation-800', FALLBACK.category)
      if (node.type === 'topic') return themeColor(styles, '--theme-success-600', FALLBACK.topic)
      if (node.type === 'page') return themeColor(styles, '--theme-elevation-250', FALLBACK.page)
      return themeColor(styles, '--theme-elevation-500', FALLBACK.article)
    }

    const ids = new Set(nodes.map((node) => node.id))
    instance.graphData({
      nodes: nodes.map<ForceNode>((node) => ({
        id: node.id,
        label: node.label,
        type: node.type,
        // Degree drives size, matching the 2D view; capped so hubs stay compact.
        val: Math.min(8, 1 + node.degree * 0.6),
        color: colorFor(node),
      })),
      links: edges
        .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
        .map<ForceLink>((edge) => ({ source: edge.source, target: edge.target, type: edge.type })),
    })
  }, [nodes, edges, ready])

  // Recolour on selection without rebuilding the scene.
  useEffect(() => {
    const instance = graphRef.current
    if (!instance) return
    const styles = containerRef.current ? getComputedStyle(containerRef.current) : null
    const highlight = styles ? themeColor(styles, '--theme-success-500', '#16a34a') : '#16a34a'
    instance.nodeColor((node: ForceNode) => (node.id === selectedId ? highlight : node.color))
  }, [selectedId, ready])

  if (failed) {
    return (
      <div className="topicGraph__state" role="status">
        The 3D view could not be loaded. Use the 2D view for the same relationships.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="topicGraph__scene"
      style={{ height: HEIGHT }}
      aria-hidden="true"
    />
  )
}
