import { useMemo, useState } from 'react'
import { initials } from '../../lib/network'

// The room as a force-directed graph in the main network page's visual
// language: tied people pull together so real clusters emerge, dashed
// oxblood ties are embedding-similarity ("you should know each other"),
// ghosts are attendees who haven't finished setup. Hover/focus someone
// to isolate their ties.
const W = 760
const H = 640
const PAD = 72
const AVATAR_FILLS = 6

const pct = (x, total) => `${(x / total) * 100}%`

// Deterministic force layout: seeded ring start, ~220 relaxation steps.
function forceLayout(nodes, edges) {
  const n = nodes.length
  if (n === 0) return {}
  const idx = Object.fromEntries(nodes.map((node, i) => [node.id, i]))
  const cx = W / 2
  const cy = H / 2
  // start on a ring, ordered by team so clusters begin near each other
  const sorted = [...nodes].sort((a, b) =>
    (a.org_unit || '~').localeCompare(b.org_unit || '~') || a.name.localeCompare(b.name),
  )
  const xs = new Array(n)
  const ys = new Array(n)
  sorted.forEach((node, i) => {
    const angle = (i / n) * 2 * Math.PI
    xs[idx[node.id]] = cx + (W / 2 - PAD) * 0.85 * Math.cos(angle)
    ys[idx[node.id]] = cy + (H / 2 - PAD) * 0.85 * Math.sin(angle)
  })

  const springs = edges
    .filter((e) => idx[e.a] !== undefined && idx[e.b] !== undefined)
    .map((e) => [idx[e.a], idx[e.b], e.semantic ? 0.5 : Math.min(1, e.weight + 0.4)])

  const repulsion = 2600 * Math.max(1, 40 / n)
  for (let step = 0; step < 220; step++) {
    const t = 1 - step / 220 // cooling
    const fx = new Array(n).fill(0)
    const fy = new Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = xs[i] - xs[j]
        let dy = ys[i] - ys[j]
        const d2 = dx * dx + dy * dy + 0.01
        const f = repulsion / d2
        const d = Math.sqrt(d2)
        dx /= d
        dy /= d
        fx[i] += dx * f
        fy[i] += dy * f
        fx[j] -= dx * f
        fy[j] -= dy * f
      }
      // gentle gravity to the centre
      fx[i] += (cx - xs[i]) * 0.012
      fy[i] += (cy - ys[i]) * 0.012
    }
    for (const [i, j, k] of springs) {
      const dx = xs[j] - xs[i]
      const dy = ys[j] - ys[i]
      const d = Math.hypot(dx, dy) || 1
      const pull = ((d - 110) / d) * 0.02 * k
      fx[i] += dx * pull
      fy[i] += dy * pull
      fx[j] -= dx * pull
      fy[j] -= dy * pull
    }
    for (let i = 0; i < n; i++) {
      xs[i] = Math.min(W - PAD, Math.max(PAD, xs[i] + fx[i] * t))
      ys[i] = Math.min(H - PAD, Math.max(PAD, ys[i] + fy[i] * t))
    }
  }

  const pos = {}
  nodes.forEach((node) => {
    pos[node.id] = { x: xs[idx[node.id]], y: ys[idx[node.id]] }
  })
  return pos
}

export default function RoomGraph({ nodes, edges }) {
  const [hot, setHot] = useState(null)
  const positions = useMemo(() => forceLayout(nodes, edges), [nodes, edges])

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
    <div className="rg">
      <div
        className="nw-graph rg-canvas"
        role="img"
        aria-label={`${nodes.length} people in the room, ${edges.length} connections between them`}
      >
        <div aria-hidden="true" className="nw-ring nw-ring--inner" />
        <div aria-hidden="true" className="nw-ring nw-ring--outer" />

        {edges.map((e) => {
          const from = positions[e.a]
          const to = positions[e.b]
          if (!from || !to) return null
          const dx = to.x - from.x
          const dy = to.y - from.y
          const lit = hot !== null && touches(e, hot)
          const dim = hot !== null && !lit
          const kind = e.semantic ? 'rg-edge--sem' : e.weight >= 0.3 ? 'nw-edge--strong' : 'nw-edge--weak'
          return (
            <div
              key={`${e.a}-${e.b}`}
              aria-hidden="true"
              className={`nw-edge ${kind} ${lit ? 'rg--lit' : ''} ${dim ? 'rg--dim' : ''}`}
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
          const size = 36 + Math.min(18, (degree[node.id] || 0) * 2.5)
          const dim =
            hot !== null &&
            hot !== node.id &&
            !edges.some((e) => touches(e, hot) && touches(e, node.id))
          return (
            <button
              key={node.id}
              type="button"
              className={`nw-node nw-node--other ${node.has_profile ? '' : 'rg-node--ghost'} ${dim ? 'rg--dim' : ''}`}
              style={{
                left: pct(at.x, W),
                top: pct(at.y, H),
                transform: `translate(-50%, -${size / 2}px)`,
              }}
              onPointerEnter={() => setHot(node.id)}
              onPointerLeave={() => setHot(null)}
              onFocus={() => setHot(node.id)}
              onBlur={() => setHot(null)}
              aria-label={[node.name, node.title, node.org_unit].filter(Boolean).join(', ')}
            >
              <span className="nw-node__avwrap">
                <span
                  className="nw-node__av"
                  style={{
                    width: size,
                    height: size,
                    fontSize: size > 46 ? 13 : 12,
                    background: node.has_profile ? `var(--avatar-${(index % AVATAR_FILLS) + 1})` : undefined,
                    animationDuration: `${2.8 + (index % 4) * 0.4}s`,
                    animationDelay: `${index * 0.19}s`,
                  }}
                >
                  {initials(node.name)}
                </span>
              </span>
              <span className="nw-node__label">{node.name.split(' ')[0]}</span>
              <span role="tooltip" className={`nw-node__tip ${at.y < H * 0.28 ? 'nw-node__tip--below' : ''}`}>
                <span className="nw-node__tip-name">{node.name}</span>
                <span className="nw-node__tip-row">
                  {node.has_profile
                    ? [node.title, node.org_unit].filter(Boolean).join(' · ') || 'Profile set up'
                    : "Hasn't finished setup yet"}
                </span>
                <span className="nw-node__tip-row">
                  {degree[node.id] || 0} connection{(degree[node.id] || 0) === 1 ? '' : 's'} in this room
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <ul className="rg-legend" aria-hidden="true">
        <li><i className="rg-key rg-key--strong" />Knows them</li>
        <li><i className="rg-key rg-key--sem" />Should meet (AI match)</li>
        <li><i className="rg-key rg-key--ghost" />Setting up</li>
      </ul>
    </div>
  )
}
