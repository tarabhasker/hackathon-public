import { useEffect, useMemo, useRef, useState } from 'react'
import { assetUrl } from '../../api'
import { FLAT_RINGS, GRAPH_H, GRAPH_W, SHELLS, initials, layoutNodes, sphereLayout } from '../../lib/network'

// Planet colours for people who aren't on the highlighted path (--avatar-1..6 in tokens.css)
const AVATAR_FILLS = 6

// --- 3D camera ---------------------------------------------------------------
const CAMERA = 1500 // distance from the sun; smaller = stronger perspective
const VIEW_SCALE = 0.98 // shrinks the whole sphere so its wider spacing still fits the frame
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

// Rotate a point by the camera angles and project it onto the screen.
function project(p, sinY, cosY, sinP, cosP) {
  const x = p.x * cosY + p.z * sinY
  const z1 = -p.x * sinY + p.z * cosY
  const y = p.y * cosP - z1 * sinP
  const z = p.y * sinP + z1 * cosP
  const scale = CAMERA / (CAMERA + z)
  return { x: CX + x * scale * VIEW_SCALE, y: CY + y * scale * VIEW_SCALE, z, scale }
}

// Sun, planets, moons, and moons of moons
const bodySize = (depth) => (depth === 0 ? 84 : depth === 1 ? 56 : depth === 2 ? 40 : 32)

function Body({ node, index, role, register, onSelect, onHover }) {
  // role: 'you' | 'target' | 'path' | 'other'
  const size = bodySize(node.depth)
  const label = role === 'you' ? 'YOU' : initials(node.name)
  return (
    <button
      type="button"
      ref={(el) => register(node.id, el)}
      className={`nw-node nw-node--${role} ${node.depth >= 2 ? 'nw-node--moon' : ''}`}
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
          className="nw-node__av"
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

// The network as a sphere of planets. You are the sun at the centre; your
// direct connections are planets on an inner shell; the people they can
// introduce you to sit on an outer shell beside them. Every body is a shaded
// sphere lit from the sun. Everyone keeps their place on the sphere and the
// whole sphere turns as one, so people never run into each other. Drag to turn
// it; it pauses while you hover or focus someone so they are easy to click.
// `path` is the list of ids from you to the selected person; those bodies and
// the links between them are highlighted.
//
// People stay real DOM buttons (photos, tooltips, keyboard focus); each frame
// we only move/scale them and repaint rings and links on a canvas behind.
export default function NetworkGraph({ nodes, edges, path, onSelect, zoom = 1, mode = '3d' }) {
  const points = useMemo(() => sphereLayout(nodes), [nodes])
  // the flat radial layout, centred on the origin like the sphere
  const flat = useMemo(() => {
    const out = {}
    const laid = layoutNodes(nodes)
    for (const id in laid) out[id] = { x: laid[id].x - CX, y: laid[id].y - CY }
    return out
  }, [nodes])
  const targetId = path.length > 1 ? path[path.length - 1] : null
  const [fitRef, fit] = useFitScale()

  const canvasRef = useRef(null)
  const stageRef = useRef(null)
  const elements = useRef({})
  const view = useRef({ morph: mode === '3d' ? 1 : 0, yaw: START_YAW, pitch: START_PITCH, hovering: false, dragging: false, moved: false })
  const register = (id, el) => {
    if (el) elements.current[id] = el
    else delete elements.current[id]
  }

  // Latest data for the animation loop, without restarting it on every change
  const scene = useRef({})
  useEffect(() => {
    scene.current = { nodes, edges, path, points, flat, mode, resolution: Math.min(fit * zoom, 2) }
  }, [nodes, edges, path, points, flat, mode, fit, zoom])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const tokens = getComputedStyle(document.documentElement)
    const primary = tokens.getPropertyValue('--primary').trim() || '#367B70'
    const line = tokens.getPropertyValue('--ds-line-strong').trim() || '#D9D2C0'
    const tieStrong = tokens.getPropertyValue('--tie-strong').trim() || '#5E8676'
    const tieWeak = tokens.getPropertyValue('--tie-weak').trim() || '#A8997C'
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let last = performance.now()
    let pixels = 0

    function draw(now) {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const v = view.current
      const { nodes: people = [], edges: links = [], path: route = [], points: at = {}, flat: flatAt = {}, mode: shape = '3d', resolution = 1 } = scene.current
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
      const look = (p) => project(p, sinY, cosY, sinP, cosP)

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
        p.r = (bodySize(person.depth) / 2) * p.scale
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

      // A faint equator on each shell so the sphere's shape is easy to read
      ctx.lineWidth = 1
      ctx.strokeStyle = line
      if (depthMix > 0.01) {
        ctx.setLineDash([])
        ctx.globalAlpha = 0.4 * depthMix
        for (const radius of [SHELLS[1], SHELLS[2]]) {
          ctx.beginPath()
          for (let s = 0; s <= 64; s++) {
            const t = (s / 64) * Math.PI * 2
            const p = look({ x: radius * Math.cos(t), y: 0, z: radius * Math.sin(t) })
            if (s === 0) ctx.moveTo(p.x, p.y)
            else ctx.lineTo(p.x, p.y)
          }
          ctx.stroke()
        }
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

      // Ties between people: plain ones first, the highlighted path on top
      const onRoute = []
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
          onRoute.push(ia < ib ? [a, b] : [b, a])
          continue
        }
        if (parentOf[link.a] !== link.b && parentOf[link.b] !== link.a) continue
        const depth = (a.scale + b.scale) / 2 // >1 near, <1 far
        // strong ties: solid sage; weak ties: dashed stone. Far ones fade a little.
        ctx.globalAlpha = Math.max(0.45, Math.min(0.95, 0.75 + (depth - 1) * 1.5))
        ctx.strokeStyle = link.weak ? tieWeak : tieStrong
        ctx.lineWidth = (link.weak ? 1.8 : 2.4) * depth
        ctx.setLineDash(link.weak ? [6, 6] : [])
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      for (const [from, to] of onRoute) {
        ctx.strokeStyle = primary
        ctx.lineWidth = 3
        ctx.setLineDash([8, 6])
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()
      }
      ctx.setLineDash([])
      ctx.lineDashOffset = 0

      // Bodies: move, scale and fade with depth; nearer ones stack on top;
      // the bright spot on each sphere faces the sun
      const sun = people.find((n) => n.depth === 0)
      const sunAt = sun ? screen[sun.id] : null
      for (const person of people) {
        const el = elements.current[person.id]
        const p = screen[person.id]
        if (!el || !p) continue
        const highlighted = person.depth === 0 || route.includes(person.id)
        const fade = Math.max(0.35, Math.min(1, 0.8 + (p.scale - 1) * 1.6))
        el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -${bodySize(person.depth) / 2}px) scale(${p.scale})`
        el.style.opacity = highlighted ? 1 : fade
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
          return (
            <Body
              key={node.id}
              node={node}
              index={index}
              role={role}
              register={register}
              onSelect={onSelect}
              onHover={(on) => {
                view.current.hovering = on
              }}
            />
          )
        })}
      </div>
      {mode === '3d' && <span className="nw-graph__hint" aria-hidden="true">Drag to rotate</span>}
    </div>
  )
}
