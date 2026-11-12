import { useMemo, useState } from 'react'
import { initials } from '../../lib/network'

// Everyone in the room around an ellipse (grouped by team so ties cluster),
// with the connections between them across the middle. Hovering or focusing
// a person isolates their ties; people who haven't finished setup sit on the
// ring as dashed outlines with no ties yet.
const W = 760
const H = 560

const pct = (x, total) => `${(x / total) * 100}%`

function layout(nodes) {
  // group by team so intra-team ties hug the rim instead of crossing it
  const sorted = [...nodes].sort((a, b) =>
    (a.org_unit || '~').localeCompare(b.org_unit || '~') || a.name.localeCompare(b.name),
  )
  const cx = W / 2
  const cy = H / 2
  const rx = W / 2 - 86
  const ry = H / 2 - 74
  const pos = {}
  sorted.forEach((n, i) => {
    const angle = (i / sorted.length) * 2 * Math.PI - Math.PI / 2
    pos[n.id] = { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) }
  })
  return pos
}

export default function RoomGraph({ nodes, edges }) {
  const [hot, setHot] = useState(null) // hovered/focused person id
  const positions = useMemo(() => layout(nodes), [nodes])

  const degree = useMemo(() => {
    const d = {}
    edges.forEach((e) => {
      d[e.a] = (d[e.a] || 0) + 1
      d[e.b] = (d[e.b] || 0) + 1
    })
    return d
  }, [edges])

  const touches = (e, id) => e.a === id || e.b === id

  return (
    <div className="rg" role="img" aria-label={`${nodes.length} people in the room, ${edges.length} connections between them`}>
      {edges.map((e) => {
        const from = positions[e.a]
        const to = positions[e.b]
        if (!from || !to) return null
        const dx = to.x - from.x
        const dy = to.y - from.y
        const dimmed = hot !== null && !touches(e, hot)
        const lit = hot !== null && touches(e, hot)
        return (
          <div
            key={`${e.a}-${e.b}`}
            aria-hidden="true"
            className={`rg-edge ${e.weight >= 0.3 ? 'rg-edge--strong' : 'rg-edge--weak'} ${dimmed ? 'rg-edge--dim' : ''} ${lit ? 'rg-edge--lit' : ''}`}
            style={{
              left: pct(from.x, W),
              top: pct(from.y, H),
              width: pct(Math.hypot(dx, dy), W),
              transform: `rotate(${(Math.atan2(dy, dx) * 180) / Math.PI}deg)`,
            }}
          />
        )
      })}

      {nodes.map((node, index) => {
        const at = positions[node.id]
        if (!at) return null
        const size = 34 + Math.min(16, (degree[node.id] || 0) * 2)
        const dimmed = hot !== null && hot !== node.id && !edges.some((e) => touches(e, hot) && touches(e, node.id))
        return (
          <button
            key={node.id}
            type="button"
            className={`rg-node ${node.has_profile ? '' : 'rg-node--ghost'} ${dimmed ? 'rg-node--dim' : ''}`}
            style={{ left: pct(at.x, W), top: pct(at.y, H), animationDelay: `${(index % 12) * 60}ms` }}
            onPointerEnter={() => setHot(node.id)}
            onPointerLeave={() => setHot(null)}
            onFocus={() => setHot(node.id)}
            onBlur={() => setHot(null)}
            aria-label={[node.name, node.title, node.org_unit].filter(Boolean).join(', ')}
          >
            <span className="rg-node__av" style={{ width: size, height: size, fontSize: size > 42 ? 13 : 11.5 }}>
              {initials(node.name)}
            </span>
            <span className="rg-node__label">{node.name.split(' ')[0]}</span>
            <span role="tooltip" className={`rg-node__tip ${at.y < H * 0.25 ? 'rg-node__tip--below' : ''}`}>
              <b>{node.name}</b>
              <span>{node.has_profile ? [node.title, node.org_unit].filter(Boolean).join(' · ') : "Hasn't finished setup yet"}</span>
              <span>{degree[node.id] || 0} connection{(degree[node.id] || 0) === 1 ? '' : 's'} in this room</span>
            </span>
          </button>
        )
      })}

      <ul className="rg-legend" aria-hidden="true">
        <li><i className="rg-key rg-key--strong" />Strong tie</li>
        <li><i className="rg-key rg-key--weak" />Weak tie</li>
        <li><i className="rg-key rg-key--ghost" />Setting up</li>
      </ul>
    </div>
  )
}
