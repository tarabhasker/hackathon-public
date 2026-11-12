import { useEffect, useMemo, useRef, useState } from 'react'
import { GRAPH_H, GRAPH_W, initials, layoutNodes } from '../../lib/network'

// Fills for people who aren't on the highlighted path (--avatar-1..6 in tokens.css)
const AVATAR_FILLS = 6

const pct = (value, total) => `${(value / total) * 100}%`

function Edge({ from, to, weak, step }) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const highlighted = step != null
  const kind = highlighted ? 'nw-edge--path' : weak ? 'nw-edge--weak' : 'nw-edge--strong'
  return (
    <div
      aria-hidden="true"
      className={`nw-edge ${kind}`}
      style={{
        left: pct(from.x, GRAPH_W),
        top: pct(from.y, GRAPH_H),
        width: pct(Math.hypot(dx, dy), GRAPH_W),
        transform: `rotate(${(Math.atan2(dy, dx) * 180) / Math.PI}deg)`,
      }}
    >
      {highlighted && <span className="nw-edge__dot" style={{ animationDelay: `${step * 0.9}s` }} />}
    </div>
  )
}

function Node({ node, index, at, role, onSelect }) {
  // role: 'you' | 'target' | 'path' | 'other'
  const size = role === 'you' ? 66 : node.depth === 1 ? 46 : 38
  const onPath = role !== 'other'
  const label = role === 'you' ? 'YOU' : initials(node.name)
  return (
    <button
      type="button"
      className={`nw-node nw-node--${role} ${!onPath && node.depth >= 2 ? 'nw-node--far' : ''}`}
      onClick={() => role !== 'you' && onSelect(node)}
      aria-label={[node.name, node.title, node.company].filter(Boolean).join(', ')}
      aria-pressed={role === 'target'}
      style={{
        left: pct(at.x, GRAPH_W),
        top: pct(at.y, GRAPH_H),
        transform: `translate(-50%, -${size / 2}px)`,
      }}
    >
      <span className="nw-node__avwrap">
        {(role === 'you' || role === 'target') && <span aria-hidden="true" className="nw-node__pulse" />}
        <span
          className="nw-node__av"
          style={{
            width: size,
            height: size,
            fontSize: role === 'you' ? 14 : node.depth === 1 ? 13 : 12,
            background: role === 'other' ? `var(--avatar-${(index % AVATAR_FILLS) + 1})` : undefined,
            animationDuration: `${2.8 + (index % 4) * 0.4}s`,
            animationDelay: `${index * 0.23}s`,
          }}
        >
          {label}
        </span>
      </span>
      <span className="nw-node__label">{role === 'you' ? 'You' : node.name}</span>
      <span role="tooltip" className={`nw-node__tip ${at.y < GRAPH_H * 0.3 ? 'nw-node__tip--below' : ''}`}>
        <span className="nw-node__tip-name">{node.name}</span>
        <span className="nw-node__tip-row">{node.title || 'Role not listed'}</span>
        <span className="nw-node__tip-row">{node.company || 'Company not listed'}</span>
      </span>
    </button>
  )
}

const MAX_FIT = 900 / GRAPH_W // never blow the drawing up past 900px wide

// Scale that fits the GRAPH_W x GRAPH_H drawing inside the element.
function useFitScale() {
  const ref = useRef(null)
  const [fit, setFit] = useState(1)
  useEffect(() => {
    const el = ref.current
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setFit(Math.min(width / GRAPH_W, height / GRAPH_H, MAX_FIT))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, fit]
}

// The radial people graph. `path` is the list of ids from the requester to the
// selected person; those nodes and the edges between them are highlighted.
// It is drawn at a fixed design size and scaled as one picture to fit its box,
// so circles, labels and spacing all shrink or grow together.
export default function NetworkGraph({ nodes, edges, path, onSelect, zoom = 1 }) {
  const positions = useMemo(() => layoutNodes(nodes), [nodes])
  const targetId = path.length > 1 ? path[path.length - 1] : null
  const [fitRef, fit] = useFitScale()

  return (
    <div className="nw-graph-fit" ref={fitRef}>
      <div
        className="nw-graph"
        style={{ width: GRAPH_W, height: GRAPH_H, transform: `translate(-50%, -50%) scale(${fit * zoom})` }}
      >
        <div aria-hidden="true" className="nw-ring nw-ring--inner" />
        <div aria-hidden="true" className="nw-ring nw-ring--outer" />

        {edges.map((e) => {
          const ia = path.indexOf(e.a)
          const ib = path.indexOf(e.b)
          const onPath = ia > -1 && ib > -1 && Math.abs(ia - ib) === 1
          // draw highlighted edges in travel direction so the dot moves away from "you"
          const [a, b] = onPath && ib < ia ? [e.b, e.a] : [e.a, e.b]
          if (!positions[a] || !positions[b]) return null
          return (
            <Edge
              key={`${e.a}-${e.b}`}
              from={positions[a]}
              to={positions[b]}
              weak={e.weak}
              step={onPath ? Math.min(ia, ib) : null}
            />
          )
        })}

        {nodes.map((node, index) => {
          const at = positions[node.id]
          if (!at) return null
          const role =
            node.depth === 0 ? 'you' : node.id === targetId ? 'target' : path.includes(node.id) ? 'path' : 'other'
          return <Node key={node.id} node={node} index={index} at={at} role={role} onSelect={onSelect} />
        })}
      </div>
    </div>
  )
}
