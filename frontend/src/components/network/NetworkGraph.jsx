import { useEffect, useMemo, useRef, useState } from 'react'
import { assetUrl } from '../../api'
import { FLAT_RINGS, GRAPH_H, GRAPH_W, SHELLS, evidenceIndex, initials, layoutNodes, ordinal, sphereLayout } from '../../lib/network'

// Planet colours for people who aren't on the highlighted path (--avatar-1..6 in tokens.css)
const AVATAR_FILLS = 6

// --- 3D camera ---------------------------------------------------------------
const CAMERA = 1500 // distance from the sun; smaller = stronger perspective
const VIEW_SCALE = 0.98 // shrinks the whole sphere so its wider spacing still fits the frame
// The network is an ellipsoid, not a round globe: wide and flat, so everyone
// travels round wide elliptical paths as it turns and it fills the wide frame.
const STRETCH = { x: 1.18, y: 0.7, z: 1.18 }
// The 3D floor grid: ring radii (the two shells plus guides) and spoke count
const FLOOR_RINGS = [70, 128, SHELLS[1], 248, SHELLS[2], 372]
const FLOOR_SPOKES = 16

// The sphere holds still (no auto-spin) at a slight angle so the depth shows;
// drag to turn it any way round.
const START_YAW = 0.4
const START_PITCH = 0.3
const MAX_PITCH = 1.3
const GAP = 28 // minimum clear space between two bodies on screen, in px (room for name labels)
const MORPH = 2.2 // 2D <-> 3D transition speed (1 / seconds)
const DRAG = 0.008 // radians per pixel dragged
const CX = GRAPH_W / 2
const CY = GRAPH_H / 2

// A theme colour ("#RRGGBB") at the given opacity, as plain rgba() so every
// browser's canvas accepts it in a gradient
function withAlpha(colour, alpha) {
  const a = Math.max(0, Math.min(1, alpha)).toFixed(3)
  const hex = /^#([0-9a-f]{6})$/i.exec(colour.trim())
  if (!hex) return `color-mix(in srgb, ${colour} ${Math.round(a * 100)}%, transparent)`
  const n = parseInt(hex[1], 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

// Rotate a point by the camera angles and project it onto the screen.
function project(p, sinY, cosY, sinP, cosP) {
  const x = p.x * cosY + p.z * sinY
  const z1 = -p.x * sinY + p.z * cosY
  const y = p.y * cosP - z1 * sinP
  const z = p.y * sinP + z1 * cosP
  const scale = CAMERA / (CAMERA + z)
  return { x: CX + x * scale * VIEW_SCALE, y: CY + y * scale * VIEW_SCALE, z, scale }
}

const REVEAL_DELAY = 450 // ms before the route starts lighting up, so the graph settles first

// Sun, planets, moons, and moons of moons — one size per degree of connection
const BODY_SIZES = [84, 56, 40, 32, 28, 25, 23]
const bodySize = (depth) => BODY_SIZES[Math.min(depth, BODY_SIZES.length - 1)]
// A Find the Target person is the destination of the story, so they're drawn
// as large as a direct connection however many hops away they are
const TARGET_SIZE = 56
const sizeOf = (node) => (node.external ? Math.max(TARGET_SIZE, bodySize(node.depth)) : bodySize(node.depth))

function Body({ node, index, role, tie, register, onSelect, onHover }) {
  // role: 'you' | 'target' | 'path' | 'other'
  const size = sizeOf(node)
  const label = role === 'you' ? 'YOU' : initials(node.name)
  return (
    <button
      type="button"
      ref={(el) => register(node.id, el)}
      className={`nw-node nw-node--${role} ${node.depth >= 2 ? 'nw-node--moon' : ''} ${node.external ? 'nw-node--external' : ''}`}
      onClick={() => role !== 'you' && onSelect(node)}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      aria-label={[node.name, node.title, node.company].filter(Boolean).join(', ')}
      aria-pressed={role === 'target'}
      style={{ transformOrigin: `50% ${size / 2}px` }}
    >
      <span className="nw-node__avwrap">
        {(role === 'you' || role === 'target') && <span aria-hidden="true" className="nw-node__pulse" />}
        <span
          className={`nw-node__av ${node.avatar_url ? 'nw-node__av--photo' : ''}`}
          style={{
            width: size,
            height: size,
            fontSize: Math.round(size * 0.27),
            '--planet': role === 'other' ? `var(--planet-${(index % AVATAR_FILLS) + 1})` : undefined,
          }}
        >
          {node.avatar_url ? (
            <img className="nw-node__img" src={assetUrl(node.avatar_url)} alt="" draggable="false" />
          ) : (
            <>
              {/* cloud bands drifting round the planet as it spins */}
              <span
                className="nw-node__bands"
                aria-hidden="true"
                style={{ animationDuration: `${16 + (index % 5) * 3}s` }}
              />
              <span className="nw-node__initials">{label}</span>
            </>
          )}
          {/* lit side and night side; the light position is set every frame */}
          <span className="nw-node__shade" aria-hidden="true" />
        </span>
      </span>
      <span className="nw-node__label">{role === 'you' ? 'You' : node.name}</span>
      <span role="tooltip" className="nw-node__tip">
        <span className="nw-node__tip-name">{node.name}</span>
        <span className="nw-node__tip-row">
          {[node.title, node.company].filter(Boolean).join('  ·  ') || 'Profile not filled in yet'}
        </span>
        {tie && (
          <span className="nw-node__tip-tie">
            <span className="nw-node__tip-meta">
              <span className="nw-node__tip-degree">{ordinal(node.depth)}-degree connection</span>
              <b className="nw-node__tip-pct">{Math.round((node.strength || 0) * 100)}%</b>
            </span>
            <i className="nw-node__tip-bar" aria-hidden="true">
              <i style={{ width: `${Math.round((node.strength || 0) * 100)}%` }} />
            </i>
            {tie.how && <span className="nw-node__tip-how">{tie.how}</span>}
          </span>
        )}
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

// The network as a sphere of planets. You are the sun at the centre; your
// direct connections are planets on an inner shell; the people they can
// introduce you to sit on an outer shell beside them. Every body is a shaded
// sphere lit from the sun. Everyone keeps their place on the sphere and the
// whole sphere turns as one, so people never run into each other. Drag to turn
// it; it pauses while you hover or focus someone so they are easy to click.
// `path` is the list of ids from you to the selected person; those bodies and
// the links between them are highlighted. With `revealMs` the route lights up
// one link at a time (that many ms per hop) each time it changes, so a long
// path to a target reads as a journey; 0 shows it at once.
//
// People stay real DOM buttons (photos, tooltips, keyboard focus); each frame
// we only move/scale them and repaint rings and links on a canvas behind.
export default function NetworkGraph({ nodes, edges, path, onSelect, zoom = 1, mode = '3d', revealMs = 0 }) {
  const points = useMemo(() => sphereLayout(nodes), [nodes])
  // the flat radial layout, centred on the origin like the sphere
  const flat = useMemo(() => {
    const out = {}
    const laid = layoutNodes(nodes)
    for (const id in laid) out[id] = { x: laid[id].x - CX, y: laid[id].y - CY }
    return out
  }, [nodes])
  const targetId = path.length > 1 ? path[path.length - 1] : null
  const byId = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes])
  const youId = useMemo(() => nodes.find((n) => n.depth === 0)?.id ?? null, [nodes])
  const evidence = useMemo(() => evidenceIndex(edges), [edges])
  const [fitRef, fit] = useFitScale()

  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const elements = useRef({})
  const view = useRef({ morph: mode === '3d' ? 1 : 0, yaw: START_YAW, pitch: START_PITCH, hovering: false, hotId: null, dragging: false, moved: false })
  const register = (id, el) => {
    if (el) elements.current[id] = el
    else delete elements.current[id]
  }

  // Who's directly tied to whom, for hover isolation
  const adjacency = useMemo(() => {
    const adj = {}
    edges.forEach((e) => {
      ;(adj[e.a] ??= new Set()).add(e.b)
      ;(adj[e.b] ??= new Set()).add(e.a)
    })
    return adj
  }, [edges])

  // Latest data for the animation loop, without restarting it on every change
  const scene = useRef({})
  useEffect(() => {
    scene.current = { nodes, edges, path, points, flat, mode, adjacency, revealMs, resolution: Math.min(fit * zoom, 2) }
  }, [nodes, edges, path, points, flat, mode, adjacency, revealMs, fit, zoom])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const tokens = getComputedStyle(document.documentElement)
    const primary = tokens.getPropertyValue('--primary').trim() || '#367B70'
    const line = tokens.getPropertyValue('--ds-line-strong').trim() || '#D9D2C0'
    const tieStrong = tokens.getPropertyValue('--tie-strong').trim() || '#5E8676'
    const tieWeak = tokens.getPropertyValue('--tie-weak').trim() || '#A8997C'
    const surface = tokens.getPropertyValue('--ds-surface').trim() || '#FFFFFF'
    const ink = tokens.getPropertyValue('--secondary').trim() || '#1B1613'
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let last = performance.now()
    let pixels = 0

    function draw(now) {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const v = view.current
      const { nodes: people = [], edges: links = [], path: route = [], points: at = {}, flat: flatAt = {}, mode: shape = '3d', adjacency: adj = {}, revealMs: hopMs = 0, resolution = 1 } = scene.current
      // How far along the route the light has travelled, in hops. A new route
      // restarts it; the same route (e.g. a background refresh) does not.
      const routeKey = route.join('-')
      if (v.routeKey !== routeKey) {
        v.routeKey = routeKey
        v.routeStart = now
        // In 3D, turn the sphere until the destination sits side-on to the
        // camera, so the route runs across the screen instead of toward you
        const end = route.length > 1 && hopMs > 0 ? at[route[route.length - 1]] : null
        v.turnTo = end ? Math.atan2(end.z * STRETCH.z, end.x * STRETCH.x) : null
      }
      if (v.turnTo != null && !v.dragging) {
        const diff = Math.atan2(Math.sin(v.turnTo - v.yaw), Math.cos(v.turnTo - v.yaw))
        if (Math.abs(diff) < 0.002 || still) {
          v.yaw = still ? v.turnTo : v.yaw + diff
          v.turnTo = null
        } else {
          v.yaw += diff * Math.min(1, dt * 2.5)
        }
      } else if (v.dragging) {
        v.turnTo = null // the user took the wheel
      }
      const lit = hopMs > 0 && !still ? Math.max(0, (now - v.routeStart - REVEAL_DELAY) / hopMs) : Infinity
      // the sphere stops turning while you hover or drag, so nobody slips away
      // ease between the flat map (0) and the sphere (1)
      const goal = shape === '3d' ? 1 : 0
      v.morph = still ? goal : v.morph + Math.sign(goal - v.morph) * Math.min(Math.abs(goal - v.morph), MORPH * dt)
      const depthMix = v.morph * v.morph * (3 - 2 * v.morph) // smoothstep

      // keep the canvas sharp at the current on-screen scale
      const wanted = Math.max(1, resolution) * Math.min(window.devicePixelRatio || 1, 2)
      if (wanted !== pixels) {
        pixels = wanted
        canvas.width = Math.round(GRAPH_W * pixels)
        canvas.height = Math.round(GRAPH_H * pixels)
      }
      ctx.setTransform(pixels, 0, 0, pixels, 0, 0)
      ctx.clearRect(0, 0, GRAPH_W, GRAPH_H)

      const sinY = Math.sin(v.yaw)
      const cosY = Math.cos(v.yaw)
      const sinP = Math.sin(v.pitch)
      const cosP = Math.cos(v.pitch)
      const look = (p) => project({ x: p.x * STRETCH.x, y: p.y * STRETCH.y, z: p.z * STRETCH.z }, sinY, cosY, sinP, cosP)

      const hot = v.hotId
      const hotId = hot
      // Where everybody is on screen right now
      const screen = {}
      const bodies = []
      for (const person of people) {
        const point = at[person.id]
        if (!point) continue
        const sphere = look(point)
        const plane = flatAt[person.id] || { x: 0, y: 0 }
        const p = {
          x: CX + plane.x + (sphere.x - CX - plane.x) * depthMix,
          y: CY + plane.y + (sphere.y - CY - plane.y) * depthMix,
          z: sphere.z * depthMix,
          scale: 1 + (sphere.scale - 1) * depthMix,
        }
        p.r = (sizeOf(person) / 2) * p.scale
        p.fixed = person.depth === 0
        screen[person.id] = p
        bodies.push(p)
      }

      // People never collide in 3D, but one in front can still cover one behind.
      // Nudge any two that would overlap on screen apart (the sun stays put).
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < bodies.length; i++) {
          for (let j = i + 1; j < bodies.length; j++) {
            const a = bodies[i]
            const b = bodies[j]
            const dx = b.x - a.x
            const dy = b.y - a.y
            const dist = Math.hypot(dx, dy) || 0.01
            const need = a.r + b.r + GAP
            if (dist >= need) continue
            const push = (need - dist) / dist
            const shareA = a.fixed ? 0 : b.fixed ? 1 : 0.5
            a.x -= dx * push * shareA
            a.y -= dy * push * shareA
            b.x += dx * push * (1 - shareA)
            b.y += dy * push * (1 - shareA)
          }
        }
      }

      // 3D reference floor: a circular grid through the middle of the network
      // (rings + spokes) that tilts with the view. It replaces the flat dot
      // background in 3D; lines fade toward the back and the outer edge.
      ctx.strokeStyle = line
      if (depthMix > 0.01) {
        ctx.setLineDash([])
        const fadeAt = (p, edge) => Math.max(0.12, Math.min(1, 0.7 + (p.scale - 1) * 2.4)) * edge * depthMix
        FLOOR_RINGS.forEach((radius, i) => {
          const edge = 1 - (i / FLOOR_RINGS.length) * 0.55
          ctx.lineWidth = radius === SHELLS[1] || radius === SHELLS[2] ? 1.8 : 1.1
          let prev = look({ x: radius, y: 0, z: 0 })
          for (let k = 1; k <= 72; k++) {
            const t = (k / 72) * Math.PI * 2
            const p = look({ x: radius * Math.cos(t), y: 0, z: radius * Math.sin(t) })
            ctx.globalAlpha = Math.min(1, 1.15 * fadeAt(p, edge))
            ctx.beginPath()
            ctx.moveTo(prev.x, prev.y)
            ctx.lineTo(p.x, p.y)
            ctx.stroke()
            prev = p
          }
        })
        ctx.lineWidth = 1.1
        const inner = FLOOR_RINGS[0]
        const outer = FLOOR_RINGS[FLOOR_RINGS.length - 1]
        for (let k = 0; k < FLOOR_SPOKES; k++) {
          const t = (k / FLOOR_SPOKES) * Math.PI * 2
          const from = look({ x: inner * Math.cos(t), y: 0, z: inner * Math.sin(t) })
          const to = look({ x: outer * Math.cos(t), y: 0, z: outer * Math.sin(t) })
          const grad = ctx.createLinearGradient(from.x, from.y, to.x, to.y)
          grad.addColorStop(0, withAlpha(line, 0.95 * fadeAt(from, 1)))
          grad.addColorStop(1, withAlpha(line, 0.95 * fadeAt(to, 0.35)))
          ctx.globalAlpha = 1
          ctx.strokeStyle = grad
          ctx.beginPath()
          ctx.moveTo(from.x, from.y)
          ctx.lineTo(to.x, to.y)
          ctx.stroke()
        }

        // A stem from each person to the floor, with a dot where it lands, so
        // you can read how far above or below the middle they sit
        ctx.strokeStyle = tieStrong
        ctx.fillStyle = tieStrong
        ctx.lineWidth = 1
        ctx.setLineDash([2, 4])
        for (const person of people) {
          const point = at[person.id]
          const top = screen[person.id]
          if (!point || !top || person.depth === 0 || Math.abs(point.y) < 12) continue
          const foot = look({ x: point.x, y: 0, z: point.z })
          const a = fadeAt(foot, 1) * (hotId != null && hotId !== person.id ? 0.3 : 1)
          ctx.globalAlpha = 0.45 * a
          ctx.beginPath()
          ctx.moveTo(top.x, top.y)
          ctx.lineTo(foot.x, foot.y)
          ctx.stroke()
          ctx.globalAlpha = 0.6 * a
          ctx.beginPath()
          ctx.ellipse(foot.x, foot.y, 3.2 * foot.scale, 1.7 * foot.scale, 0, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.setLineDash([])
        ctx.strokeStyle = line
        ctx.lineWidth = 1
      }

      // 2D: plain dashed hop rings round you
      if (depthMix < 0.99) {
        ctx.setLineDash([5, 7])
        FLAT_RINGS.forEach((radius, i) => {
          ctx.globalAlpha = (i === 0 ? 0.9 : 0.6) * (1 - depthMix)
          ctx.beginPath()
          ctx.arc(CX, CY, radius, 0, Math.PI * 2)
          ctx.stroke()
        })
      }

      // Ties between people: every link among shown people is drawn — the
      // path tree solid, cross-ties between your connections fainter. Hovering
      // someone isolates their ties and labels each with its strength.
      const onRoute = []
      const hotLabels = []
      ctx.lineCap = 'round'
      const parentOf = {}
      for (const person of people) parentOf[person.id] = person.via
      for (const link of links) {
        const a = screen[link.a]
        const b = screen[link.b]
        if (!a || !b) continue
        const ia = route.indexOf(link.a)
        const ib = route.indexOf(link.b)
        if (ia > -1 && ib > -1 && Math.abs(ia - ib) === 1) {
          onRoute.push(ia < ib ? [a, b, ia] : [b, a, ib])
          continue
        }
        const onTree = parentOf[link.a] === link.b || parentOf[link.b] === link.a
        const touchesHot = hot != null && (link.a === hot || link.b === hot)
        const depth = (a.scale + b.scale) / 2 // >1 near, <1 far
        // every tie is a solid line; its thickness and presence carry the
        // strength (hover for the exact %). Far ones fade a little.
        const w = Math.max(0.05, Math.min(1, link.weight ?? 0.5))
        let alpha = (onTree ? 0.4 + w * 0.5 : 0.18 + w * 0.3) + (depth - 1) * 0.8
        alpha = Math.max(0.15, Math.min(0.95, alpha))
        if (hot != null) alpha = touchesHot ? 0.95 : alpha * 0.18
        // in 3D, ties that aren't part of anyone's route to you sit further
        // back, and every line fades toward whichever end is further away
        if (!onTree && !touchesHot) alpha *= 1 - 0.45 * depthMix
        const colour = touchesHot ? primary : w < 0.3 ? tieWeak : tieStrong
        const near = (p) => 1 - depthMix + depthMix * Math.max(0.3, Math.min(1, 0.72 + (p.scale - 1) * 2.6))
        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
        grad.addColorStop(0, withAlpha(colour, alpha * (touchesHot ? 1 : near(a))))
        grad.addColorStop(1, withAlpha(colour, alpha * (touchesHot ? 1 : near(b))))
        ctx.globalAlpha = 1
        ctx.strokeStyle = grad
        ctx.lineWidth = (touchesHot ? 2.8 : (1 + w * 2.4) * (onTree ? 1 : 0.75)) * depth
        ctx.setLineDash([])
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
        if (touchesHot && link.weight != null) {
          hotLabels.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, weight: link.weight })
        }
      }
      ctx.globalAlpha = 1
      for (const [from, to, hop] of onRoute) {
        const t = Math.max(0, Math.min(1, lit - hop)) // how much of this link is lit
        if (t <= 0) continue
        const end = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
        if (lit !== Infinity) {
          // a soft glow under the link while the route is being revealed
          ctx.setLineDash([])
          ctx.strokeStyle = withAlpha(primary, 0.22)
          ctx.lineWidth = 9
          ctx.beginPath()
          ctx.moveTo(from.x, from.y)
          ctx.lineTo(end.x, end.y)
          ctx.stroke()
        }
        ctx.strokeStyle = primary
        ctx.lineWidth = 3
        ctx.setLineDash([8, 6])
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(end.x, end.y)
        ctx.stroke()
        if (t < 1) {
          // the travelling spark at the head of the light
          ctx.setLineDash([])
          ctx.fillStyle = primary
          ctx.beginPath()
          ctx.arc(end.x, end.y, 5, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.setLineDash([])
      ctx.lineDashOffset = 0

      // Strength labels on the hovered person's ties
      if (hotLabels.length > 0) {
        ctx.font = '600 11px "Inter", system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        for (const tag of hotLabels) {
          const text = `${Math.round(tag.weight * 100)}%`
          const w = ctx.measureText(text).width + 12
          ctx.globalAlpha = 0.96
          ctx.fillStyle = surface
          ctx.strokeStyle = primary
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.roundRect(tag.x - w / 2, tag.y - 9, w, 18, 9)
          ctx.fill()
          ctx.stroke()
          ctx.fillStyle = ink
          ctx.fillText(text, tag.x, tag.y + 0.5)
        }
        ctx.globalAlpha = 1
      }

      // Bodies: move, scale and fade with depth; nearer ones stack on top;
      // the bright spot on each sphere faces the sun
      const sun = people.find((n) => n.depth === 0)
      const sunAt = sun ? screen[sun.id] : null
      for (const person of people) {
        const el = elements.current[person.id]
        const p = screen[person.id]
        if (!el || !p) continue
        const stop = route.indexOf(person.id)
        const reached = stop > -1 && lit >= stop
        const highlighted = person.depth === 0 || reached
        // route people the light hasn't reached yet look like everyone else
        el.classList.toggle('nw-node--pending', stop > 0 && !reached)
        // the moment the light arrives, the person flashes
        if (reached && lit !== Infinity && el.dataset.arrived !== routeKey) {
          el.dataset.arrived = routeKey
          el.classList.remove('nw-node--arrive')
          void el.offsetWidth // restart the CSS animation
          el.classList.add('nw-node--arrive')
        }
        let fade = Math.max(0.35, Math.min(1, 0.8 + (p.scale - 1) * 1.6))
        // hovering someone dims everyone not tied to them
        if (hot != null && person.id !== hot && !adj[hot]?.has(person.id)) fade *= 0.35
        el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -${sizeOf(person) / 2}px) scale(${p.scale})`
        el.style.opacity = highlighted && hot == null ? 1 : hot === person.id ? 1 : fade
        el.style.zIndex = Math.round(1000 - p.z) + (highlighted ? 400 : 0)
        if (sunAt && person.depth > 0) {
          const dx = sunAt.x - p.x
          const dy = sunAt.y - p.y
          const d = Math.hypot(dx, dy) || 1
          el.style.setProperty('--lx', `${50 + (dx / d) * 30}%`)
          el.style.setProperty('--ly', `${50 + (dy / d) * 30}%`)
        }
        // tooltip flips below for bodies near the top edge
        el.classList.toggle('nw-node--tip-below', p.y < GRAPH_H * 0.3)
        // names on the far side are hidden so they don't sit behind nearer people
        el.classList.toggle('nw-node--back', !highlighted && p.z > 70)
        el.classList.toggle('nw-node--flat', depthMix < 0.5)
      }
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])

  // Drag anywhere to turn the system. A drag never counts as a click.
  function onPointerDown(event) {
    if (event.button !== 0 || scene.current.mode !== '3d') return
    const v = view.current
    v.dragging = true
    v.moved = false
    v.startX = event.clientX
    v.startY = event.clientY
    v.startYaw = v.yaw
    v.startPitch = v.pitch
  }
  function onPointerMove(event) {
    const v = view.current
    if (!v.dragging) return
    const dx = event.clientX - v.startX
    const dy = event.clientY - v.startY
    if (!v.moved && Math.hypot(dx, dy) < 5) return
    if (!v.moved) {
      v.moved = true
      stageRef.current.setPointerCapture?.(event.pointerId)
      stageRef.current.classList.add('is-dragging')
    }
    v.yaw = v.startYaw + dx * DRAG
    v.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, v.startPitch + dy * DRAG))

  }
  function onPointerUp() {
    view.current.dragging = false
    stageRef.current.classList.remove('is-dragging')
  }
  function onClickCapture(event) {
    if (view.current.moved) {
      event.stopPropagation()
      event.preventDefault()
      view.current.moved = false
    }
  }

  return (
    <div
      className={`nw-graph-fit nw-graph-fit--${mode}`}
      ref={(el) => {
        fitRef.current = el
        stageRef.current = el
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={onClickCapture}
    >
      <div
        className="nw-graph"
        style={{ width: GRAPH_W, height: GRAPH_H, transform: `translate(-50%, -50%) scale(${fit * zoom})` }}
      >
        <canvas ref={canvasRef} className="nw-graph__links" aria-hidden="true" />
        {nodes.map((node, index) => {
          if (!points[node.id]) return null
          const role =
            node.depth === 0 ? 'you' : node.id === targetId ? 'target' : path.includes(node.id) ? 'path' : 'other'
          const viaName = node.via != null && node.via !== youId ? byId[node.via]?.name : null
          const tie = node.depth > 0
            ? { how: [evidence(node.via, node.id), viaName ? `via ${viaName}` : null].filter(Boolean).join(' · ') }
            : null
          return (
            <Body
              key={node.id}
              node={node}
              index={index}
              role={role}
              tie={tie}
              register={register}
              onSelect={onSelect}
              onHover={(on) => {
                view.current.hovering = on
                if (on) view.current.hotId = node.id
                else if (view.current.hotId === node.id) view.current.hotId = null
              }}
            />
          )
        })}
      </div>
      {mode === '3d' && <span className="nw-graph__hint" aria-hidden="true">Drag to rotate</span>}
    </div>
  )
}
