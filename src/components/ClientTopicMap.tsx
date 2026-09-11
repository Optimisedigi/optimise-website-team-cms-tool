'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CategorySummary, TopicAuthorityGraph, TopicGraphEdge, TopicGraphNode } from '@/lib/topic-authority-graph'
import ClientTopicMap3D from './ClientTopicMap3D'
import './ClientTopicMap.css'

type LoadState = 'loading' | 'ready' | 'error'
type GraphView = '2d' | '3d'
type Position = { x: number; y: number }

const WIDTH = 900
const HEIGHT = 560

function positionNodes(nodes: TopicGraphNode[]): Map<string, Position> {
  const result = new Map<string, Position>()
  const categories = nodes.filter((node) => node.type === 'category')
  categories.forEach((node, index) => {
    const angle = (index / Math.max(categories.length, 1)) * Math.PI * 2 - Math.PI / 2
    result.set(node.id, { x: 450 + Math.cos(angle) * 245, y: 280 + Math.sin(angle) * 175 })
  })
  const topics = nodes.filter((node) => node.type === 'topic')
  topics.forEach((node, index) => {
    const parents = node.categoryIds.map((id) => result.get(id)).filter((value): value is Position => Boolean(value))
    const center = parents.length ? { x: parents.reduce((sum, p) => sum + p.x, 0) / parents.length, y: parents.reduce((sum, p) => sum + p.y, 0) / parents.length } : { x: 450, y: 280 }
    const angle = ((index * 137.5) * Math.PI) / 180
    result.set(node.id, { x: center.x + Math.cos(angle) * 78, y: center.y + Math.sin(angle) * 58 })
  })
  const articles = nodes.filter((node) => node.type === 'article')
  articles.forEach((node, index) => {
    const topic = node.topicIds.map((id) => result.get(id)).find(Boolean)
    const category = node.categoryIds.map((id) => result.get(id)).find(Boolean)
    const center = topic ?? category ?? { x: 450, y: 280 }
    const angle = ((index * 111.25) * Math.PI) / 180
    const ring = 34 + (index % 3) * 14
    result.set(node.id, { x: center.x + Math.cos(angle) * ring, y: center.y + Math.sin(angle) * ring })
  })
  const pages = nodes.filter((node) => node.type === 'page')
  pages.forEach((node, index) => {
    const side = index % 4
    const step = 65 + Math.floor(index / 4) * 70
    result.set(node.id, side === 0 ? { x: step, y: 35 } : side === 1 ? { x: WIDTH - 35, y: step } : side === 2 ? { x: WIDTH - step, y: HEIGHT - 35 } : { x: 35, y: HEIGHT - step })
  })
  return result
}

function nodeDescription(node: TopicGraphNode): string {
  const type = node.type === 'topic' ? 'Topic' : node.type[0].toUpperCase() + node.type.slice(1)
  return `${type}: ${node.label}. ${node.degree} relationships${node.status ? `. Status ${node.status}` : ''}.`
}

function Detail({ node, category, graph }: { node?: TopicGraphNode; category?: CategorySummary; graph: TopicAuthorityGraph }) {
  if (!node) return <aside className="topicGraph__detail"><h4>Explore evidence</h4><p>Select a node to inspect its direct relationships and coverage evidence.</p></aside>
  const neighbors = graph.edges.filter((edge) => edge.source === node.id || edge.target === node.id)
  const neighborNodes = neighbors.flatMap((edge) => {
    const neighborId = edge.source === node.id ? edge.target : edge.source
    const neighbor = graph.nodes.find((candidate) => candidate.id === neighborId)
    return neighbor ? [neighbor] : []
  }).filter((neighbor, index, values) => values.findIndex((candidate) => candidate.id === neighbor.id) === index)
  const topic = graph.topics.find((item) => item.id === node.id)
  return <aside className="topicGraph__detail" aria-live="polite">
    <h4>{node.label}</h4>
    <p>{nodeDescription(node)}</p>
    <dl>
      <dt>Type</dt><dd>{node.type}</dd>
      <dt>Relationships</dt><dd>{neighbors.length}</dd>
      {category && <><dt>Health</dt><dd>{category.health}</dd><dt>Articles</dt><dd>{category.articleCount}</dd><dt>Connectivity</dt><dd>{category.publishedLinkCount}/{category.possibleInternalLinks}</dd><dt>Isolated</dt><dd>{category.orphanCount}</dd><dt>Bridges</dt><dd>{category.bridgeCount}</dd><dt>Suggestions</dt><dd>{category.pendingSuggestionCount}</dd></>}
    </dl>
    {topic?.gaps.length ? <><strong>Coverage gaps</strong><ul>{topic.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></> : null}
    {neighborNodes.length ? <><strong>Direct neighbors</strong><ul>{neighborNodes.map((neighbor) => <li key={neighbor.id}>{neighbor.adminUrl ? <a href={neighbor.adminUrl}>{neighbor.label}</a> : neighbor.label}</li>)}</ul></> : null}
    {node.adminUrl && <p><a href={node.adminUrl}>Open article in admin</a></p>}
    {node.url && !node.adminUrl && <span>Path: {node.url}</span>}
  </aside>
}

const ClientTopicMap = () => {
  const { id } = useDocumentInfo()
  const [graph, setGraph] = useState<TopicAuthorityGraph | null>(null)
  const [state, setState] = useState<LoadState>('loading')
  const [retryKey, setRetryKey] = useState(0)
  const [category, setCategory] = useState('all')
  const [topic, setTopic] = useState('all')
  const [status, setStatus] = useState('all')
  const [edgeType, setEdgeType] = useState('all')
  const [showIsolated, setShowIsolated] = useState(true)
  const [selectedId, setSelectedId] = useState<string>()
  const [zoom, setZoom] = useState(1)
  const [view, setView] = useState<GraphView>('2d')

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    setState('loading')
    fetch(`/api/blog-posts/topic-map?clientId=${encodeURIComponent(String(id))}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Request failed')
        return response.json()
      })
      .then((data) => { if (data.ok && data.graph) { setGraph(data.graph); setState('ready') } else throw new Error('Invalid response') })
      .catch((error) => { if (error instanceof Error && error.name !== 'AbortError') setState('error') })
    return () => controller.abort()
  }, [id, retryKey])

  const visible = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] }
    const baseNodes = graph.nodes.filter((node) => {
      if (category !== 'all' && node.id !== category && !node.categoryIds.includes(category)) return false
      if (topic !== 'all') {
        if (node.type === 'topic' ? node.id !== topic : !node.topicIds.includes(topic)) return false
      }
      if (status !== 'all' && node.type === 'article' && node.status !== status) return false
      if (!showIsolated && node.type === 'article' && !graph.edges.some((edge) => (edge.type === 'published_link' || edge.type === 'suggested_link') && (edge.source === node.id || edge.target === node.id))) return false
      return true
    })
    const ids = new Set(baseNodes.map((node) => node.id))
    const edges = graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target) && (edgeType === 'all' || edge.type === edgeType))
    const connected = new Set(edges.flatMap((edge) => [edge.source, edge.target]))
    const nodes = baseNodes.filter((node) => node.type === 'category' || node.type === 'topic' || connected.has(node.id) || showIsolated)
    return { nodes, edges }
  }, [graph, category, topic, status, edgeType, showIsolated])
  const positions = useMemo(() => positionNodes(visible.nodes), [visible.nodes])
  const hasVisibleEvidence = visible.edges.length > 0 || visible.nodes.some((node) => node.type === 'article' || node.type === 'page')
  const selected = graph?.nodes.find((node) => node.id === selectedId)
  const selectedCategory = graph?.categories.find((item) => item.id === selected?.id)
  const selectNode = useCallback((nodeId: string) => setSelectedId(nodeId), [])

  if (!id) return null
  if (state === 'loading') return <div className="topicGraph__state" role="status">Building category and link evidence…</div>
  if (state === 'error') return <div className="topicGraph__state" role="alert"><span>The topic graph could not be loaded.</span><button className="topicGraph__button" onClick={() => setRetryKey((value) => value + 1)}>Retry topic graph</button></div>
  if (!graph) return null

  return <section className="topicGraph" aria-labelledby="topic-graph-heading">
    <h3 id="topic-graph-heading">Topical coverage graph</h3>
    <p className="topicGraph__intro">Categories define coverage regions. Solid links are published evidence; dashed links are recommendations. Node size reflects relationship count, not authority.</p>
    <div className="topicGraph__summary" aria-label="Graph summary">
      <div className="topicGraph__metric"><strong>{graph.summary.categoryCount}</strong><span>categories</span></div>
      <div className="topicGraph__metric"><strong>{graph.summary.articleCount}</strong><span>articles</span></div>
      <div className="topicGraph__metric"><strong>{graph.summary.orphanArticles}</strong><span>isolated articles</span></div>
      <div className="topicGraph__metric"><strong>{graph.summary.pendingSuggestions}</strong><span>pending suggestions</span></div>
    </div>
    {graph.summary.truncated && <p className="topicGraph__warning">This view reached its data limit. Counts may understate the full site.</p>}
    {graph.summary.articleCount === 0 ? <div className="topicGraph__state"><strong>No articles yet</strong><span>Configured categories remain available as content opportunities.</span><ul>{graph.categories.map((item) => <li key={item.id}>{item.label}: {item.health}</li>)}</ul></div> : <>
      <div className="topicGraph__controls" aria-label="Graph filters">
        <label className="topicGraph__field">Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{graph.categories.map((item) => <option key={item.id} value={item.id}>{item.label} ({item.articleCount})</option>)}</select></label>
        <label className="topicGraph__field">Topic<select value={topic} onChange={(event) => setTopic(event.target.value)}><option value="all">All topics</option>{graph.topics.map((item) => <option key={item.id} value={item.id}>{item.label} ({item.articleCount})</option>)}</select></label>
        <label className="topicGraph__field">Publication status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="published">Published</option><option value="review">Review</option><option value="draft">Draft</option></select></label>
        <label className="topicGraph__field">Relationship<select value={edgeType} onChange={(event) => setEdgeType(event.target.value)}><option value="all">All relationships</option><option value="published_link">Published links</option><option value="suggested_link">Suggested links</option><option value="in_category">Category membership</option><option value="tagged_with">Topic membership</option></select></label>
        <label className="topicGraph__check"><input type="checkbox" checked={showIsolated} onChange={(event) => setShowIsolated(event.target.checked)} />Show isolated</label>
        <button className="topicGraph__button" onClick={() => { setCategory('all'); setTopic('all'); setStatus('all'); setEdgeType('all'); setShowIsolated(true); setSelectedId(undefined); setZoom(1) }}>Reset view</button>
      </div>
      {!hasVisibleEvidence ? <div className="topicGraph__state" role="status">No graph evidence matches these filters.</div> : <div className="topicGraph__workspace">
        <div className="topicGraph__canvas">
          <div className="topicGraph__canvasHeader">
            <strong>{visible.nodes.length} visible nodes</strong>
            <div className="topicGraph__viewSwitch" role="group" aria-label="Graph view">
              <button className="topicGraph__button" aria-pressed={view === '2d'} onClick={() => setView('2d')}>2D</button>
              <button className="topicGraph__button" aria-pressed={view === '3d'} onClick={() => setView('3d')}>3D</button>
            </div>
            {view === '2d' && <div className="topicGraph__zoom" aria-label="Graph zoom"><button className="topicGraph__button" onClick={() => setZoom((value) => Math.max(.7, value - .1))} aria-label="Zoom out">−</button><button className="topicGraph__button" onClick={() => setZoom(1)} aria-label="Reset zoom">{Math.round(zoom * 100)}%</button><button className="topicGraph__button" onClick={() => setZoom((value) => Math.min(1.5, value + .1))} aria-label="Zoom in">+</button></div>}
          </div>
          {view === '3d' && <ClientTopicMap3D nodes={visible.nodes} edges={visible.edges} selectedId={selectedId} onSelect={selectNode} />}
          {view === '3d' && <p className="sr-only">The 3D view is decorative. Every relationship it shows is listed in the visible relationships table below.</p>}
          {view === '2d' && <svg className="topicGraph__svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-labelledby="topic-graph-title topic-graph-description">
            <title id="topic-graph-title">Client category, topic, article, and internal page relationships</title><desc id="topic-graph-description">Select any labelled node for details. The complete relationships follow in a table.</desc>
            <defs><marker id="topic-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
            <g transform={`translate(${WIDTH * (1 - zoom) / 2} ${HEIGHT * (1 - zoom) / 2}) scale(${zoom})`}>
              {visible.edges.map((edge) => { const source = positions.get(edge.source); const target = positions.get(edge.target); return source && target ? <line key={edge.id} className={`topicGraph__edge topicGraph__edge--${edge.type}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} markerEnd={(edge.type === 'published_link' || edge.type === 'suggested_link') ? 'url(#topic-arrow)' : undefined}><title>{edge.type.replaceAll('_', ' ')} from {graph.nodes.find((node) => node.id === edge.source)?.label} to {graph.nodes.find((node) => node.id === edge.target)?.label}</title></line> : null })}
              {visible.nodes.map((node) => { const point = positions.get(node.id); if (!point) return null; const size = Math.min(25, 10 + node.degree * 1.5); return <g key={node.id} className={`topicGraph__node topicGraph__node--${node.type}${selectedId === node.id ? ' topicGraph__node--selected' : ''}`} role="button" tabIndex={0} aria-pressed={selectedId === node.id} aria-label={nodeDescription(node)} transform={`translate(${point.x} ${point.y})`} onClick={() => selectNode(node.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNode(node.id) } }}>{node.type === 'topic' ? <rect x={-size} y={-size * .65} width={size * 2} height={size * 1.3} rx="3" /> : <circle r={size} />}<text textAnchor="middle" y={size + 15}>{node.label.length > 24 ? `${node.label.slice(0, 22)}…` : node.label}</text></g> })}
            </g>
          </svg>}
          <div className="topicGraph__legend"><span><i className="topicGraph__line" />Published link</span><span><i className="topicGraph__line topicGraph__line--dash" />Suggested link</span>{view === '2d' ? <><span>Circles: categories, articles, pages</span><span>Rectangles: topics</span></> : <><span>Larger spheres carry more relationships</span><span>Drag to orbit, scroll to zoom</span></>}</div>
        </div>
        <Detail node={selected} category={selectedCategory} graph={graph} />
      </div>}
      <div className="topicGraph__tableWrap"><h4>Visible relationships</h4><table className="topicGraph__table"><caption className="sr-only">Complete accessible alternative for visible graph relationships</caption><thead><tr><th scope="col">From</th><th scope="col">Relationship</th><th scope="col">To</th><th scope="col">Evidence</th></tr></thead><tbody>{visible.edges.map((edge: TopicGraphEdge) => { const source = graph.nodes.find((node) => node.id === edge.source); const target = graph.nodes.find((node) => node.id === edge.target); return <tr key={edge.id}><td>{source?.label}</td><td>{edge.type.replaceAll('_', ' ')}</td><td>{target?.label}</td><td>{edge.type === 'suggested_link' ? `${edge.status}, ${edge.confidence ?? 'unknown'}% confidence` : 'Published or assigned'}</td></tr> })}</tbody></table></div>
    </>}
  </section>
}

export default ClientTopicMap
