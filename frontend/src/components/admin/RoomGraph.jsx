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

// Deterministic pseudo-random, so the same room always draws the same
function rand(seed) {
  let t = seed + 0x6d2b79f5
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// Force layout from a clustered-cloud start (not a ring): teams seed near a
// shared spot with jitter, springs pull tied people together, repulsion and
// centre gravity keep it an organic blob.
function forceLayout(nodes, edges) {
  const n = nodes.length
  if (n === 0) return {}
  const idx = Object.fromEntries(nodes.map((node, i) => [node.id, i]))
  const cx = W / 2
  const cy = H / 2

  // one anchor angle per team; members start in a jittered cloud around it
  const teams = [...new Set(nodes.map((node) => node.org_unit || '~'))].sort()
  const anchor = {}
  teams.forEach((team, i) => {
    const angle = (i / teams.length) * 2 * Math.PI + 0.7
    anchor[team] = {
      x: cx + 150 * Math.cos(angle),
      y: cy + 120 * Math.sin(angle),
    }
  })
  const xs = new Array(n)
  const ys = new Array(n)
  nodes.forEach((node, i) => {
    const a = anchor[node.org_unit || '~']
    xs[i] = a.x + (rand(i * 2 + 1) - 0.5) * 320
    ys[i] = a.y + (rand(i * 2 + 2) - 0.5) * 260
  })

  const springs = edges
    .filter((e) => idx[e.a] !== undefined && idx[e.b] !== undefined)
    .map((e) => [idx[e.a], idx[e.b], e.semantic ? 0.5 : Math.min(1, e.weight + 0.4)])

  const rest = 170 // springs relax at a comfortable arm's length
  const repulsion = 5200
  for (let step = 0; step < 260; step++) {
    const t = 1 - step / 260 // cooling
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
      // gentle gravity: just enough to keep stray components on canvas
      fx[i] += (cx - xs[i]) * 0.008
      fy[i] += (cy - ys[i]) * 0.008
    }
    for (const [i, j, k] of springs) {
      const dx = xs[j] - xs[i]
      const dy = ys[j] - ys[i]
      const d = Math.hypot(dx, dy) || 1
      const pull = ((d - rest) / d) * 0.04 * k
      fx[i] += dx * pull
      fy[i] += dy * pull
      fx[j] -= dx * pull
      fy[j] -= dy * pull
    }
    for (let i = 0; i < n; i++) {
      xs[i] += fx[i] * t
      ys[i] += fy[i] * t
    }
  }

  // normalise: spread the result to use the canvas, whatever n is
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const sx = (W - 2 * PAD) / Math.max(1, maxX - minX)
  const sy = (H - 2 * PAD) / Math.max(1, maxY - minY)
  const s = Math.min(sx, sy, 3)
  const ox = (W - (maxX - minX) * s) / 2
  const oy = (H - (maxY - minY) * s) / 2
  for (let i = 0; i < n; i++) {
    xs[i] = ox + (xs[i] - minX) * s
    ys[i] = oy + (ys[i] - minY) * s
  }

  // hard no-overlap pass: avatars plus labels need breathing room
  const MIN_D = 78
  for (let pass = 0; pass < 24; pass++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = xs[j] - xs[i]
        const dy = ys[j] - ys[i]
        const d = Math.hypot(dx, dy) || 0.01
        if (d < MIN_D) {
          const push = (MIN_D - d) / 2
          const ux = dx / d
          const uy = dy / d
          xs[i] -= ux * push
          ys[i] -= uy * push
          xs[j] += ux * push
          ys[j] += uy * push
          moved = true
        }
      }
    }
    if (!moved) break
  }

  const pos = {}
  nodes.forEach((node) => {
    const i = idx[node.id]
    pos[node.id] = {
      x: Math.min(W - PAD, Math.max(PAD, xs[i])),
      y: Math.min(H - PAD, Math.max(PAD, ys[i])),
    }
  })
  return pos
}

export default function RoomGraph({ nodes, edges, focusTeam = null }) {
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

  const teamOf = useMemo(() => Object.fromEntries(nodes.map((node) => [node.id, node.org_unit])), [nodes])
  const inFocus = (id) => focusTeam === null || teamOf[id] === focusTeam
  const touches = (e, id) => e.a === id || e.b === id

  return (
    <div className="rg">
      <div
        className="nw-graph rg-canvas"
        role="img"
        aria-label={`${nodes.length} people in the room, ${edges.length} connections between them`}
      >
        {edges.map((e) => {
          const from = positions[e.a]
          const to = positions[e.b]
          if (!from || !to) return null
          const dx = to.x - from.x
          const dy = to.y - from.y
          const lit = hot !== null && touches(e, hot)
          const dim = (hot !== null && !lit) || (hot === null && !(inFocus(e.a) || inFocus(e.b)))
          const kind = e.semantic ? 'rg-edge--sem' : e.weight >= 0.25 ? 'rg-edge--solid' : 'rg-edge--solid rg-edge--faint'
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
            (hot !== null &&
              hot !== node.id &&
              !edges.some((e) => touches(e, hot) && touches(e, node.id))) ||
            (hot === null && !inFocus(node.id))
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
                    : 'Profile pending'}
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
        <li><i className="rg-key rg-key--strong" />Connected</li>
        <li><i className="rg-key rg-key--sem" />Suggested connection</li>
        <li><i className="rg-key rg-key--ghost" />Profile pending</li>
      </ul>
    </div>
  )
}
