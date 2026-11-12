import { useEffect, useRef } from 'react'

// Animated "people finding each other" backdrop: drifting avatar bubbles that
// link up when they come close, with messages travelling along the links.
// Bubbles steer around any element marked `data-backdrop-avoid` inside the
// nearest `data-backdrop-host`
// (the logo and the headline), so they never sit on top of text.
// Purely decorative. Brand colours are read from the theme tokens, and the
// animation is replaced by a single still frame under prefers-reduced-motion.

const INITIALS = ['NA', 'WL', 'HR', 'SL', 'AN', 'JT', 'DK', 'PS', 'KM', 'RB', 'EL', 'TM', 'YB', 'CM', 'AS', 'TF']
const LINK_DISTANCE = 190
const MAX_RINGS = 3
const rand = (min, max) => min + Math.random() * (max - min)

export default function SocialBackdrop({ className = '' }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    let primary, primaryInk, ink, font
    let fills = []
    function readTokens() {
      const tokens = getComputedStyle(document.documentElement)
      primary = tokens.getPropertyValue('--primary').trim() || '#367B70'
      primaryInk = tokens.getPropertyValue('--primary-ink').trim() || '#FFFFFF'
      ink = tokens.getPropertyValue('--secondary').trim() || '#1E4542'
      font = tokens.getPropertyValue('--ds-font').trim() || 'sans-serif'
      fills = [1, 2, 3, 4, 5, 6].map((i) => tokens.getPropertyValue(`--avatar-${i}`).trim() || '#EDE4D9')
    }
    readTokens()
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let width = 0
    let height = 0
    let nodes = []
    let pulses = [] // messages travelling a -> b
    let rings = [] // "new connection" ripples
    let frame = 0
    let last = 0
    let sincePulse = 0
    let avoid = [] // keep-out rects, in canvas coordinates
    let sinceAvoid = 0

    const AVOID_GAP = 14 // clearance between a bubble and a keep-out rect

    function readAvoid() {
      const origin = canvas.getBoundingClientRect()
      const host = canvas.closest('[data-backdrop-host]') || canvas.parentElement
      avoid = [...host.querySelectorAll('[data-backdrop-avoid]')].map((el) => {
        const r = el.getBoundingClientRect()
        return { l: r.left - origin.left, t: r.top - origin.top, r: r.right - origin.left, b: r.bottom - origin.top }
      })
    }

    const insideAvoid = (x, y, radius) =>
      avoid.some((a) => x > a.l - radius - AVOID_GAP && x < a.r + radius + AVOID_GAP && y > a.t - radius - AVOID_GAP && y < a.b + radius + AVOID_GAP)

    // Push a bubble out of any keep-out rect through the nearest edge that
    // keeps it on the canvas, and send it moving away from the rect.
    function pushOut(n) {
      for (const a of avoid) {
        const pad = n.r + AVOID_GAP
        const L = a.l - pad
        const R = a.r + pad
        const T = a.t - pad
        const B = a.b + pad
        if (!(n.x > L && n.x < R && n.y > T && n.y < B)) continue
        const exits = [
          { d: n.x - L, x: L, y: n.y, vx: -1, vy: 0 },
          { d: R - n.x, x: R, y: n.y, vx: 1, vy: 0 },
          { d: n.y - T, x: n.x, y: T, vx: 0, vy: -1 },
          { d: B - n.y, x: n.x, y: B, vx: 0, vy: 1 },
        ]
          .filter((e) => e.x >= n.r && e.x <= width - n.r && e.y >= n.r && e.y <= height - n.r)
          .sort((p, q) => p.d - q.d)
        const exit = exits[0]
        if (!exit) continue
        n.x = exit.x
        n.y = exit.y
        if (exit.vx) n.vx = exit.vx * Math.abs(n.vx || 8)
        if (exit.vy) n.vy = exit.vy * Math.abs(n.vy || 8)
      }
    }

    function seed() {
      const compact = height < 260 // phone banner: fewer, smaller bubbles
      const count = Math.max(5, Math.min(30, Math.round((width * height) / 30000)))
      readAvoid()
      nodes = Array.from({ length: count }, (_, i) => {
        const r = compact ? rand(12, 18) : rand(15, 26)
        // start somewhere clear of the logo and text
        let x = rand(40, width - 40)
        let y = rand(40, height - 40)
        for (let tries = 0; tries < 40 && insideAvoid(x, y, r); tries++) {
          x = rand(40, width - 40)
          y = rand(40, height - 40)
        }
        return {
          x,
          y,
          r,
          vx: rand(-12, 12),
          vy: rand(-12, 12),
          label: INITIALS[i % INITIALS.length],
          accent: i % 5 === 0,
          fill: i % 6,
          linked: new Set(),
        }
      })
      nodes.forEach(pushOut)
      pulses = []
      rings = []
    }

    function resize() {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const grewALot = Math.abs(rect.width - width) > 120 || Math.abs(rect.height - height) > 120
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (nodes.length === 0 || grewALot) seed()
      else {
        readAvoid()
        nodes.forEach(pushOut)
      }
      if (still) draw(0)
    }

    function move(dt) {
      for (const n of nodes) {
        n.x += n.vx * dt
        n.y += n.vy * dt
        if (n.x < n.r) { n.x = n.r; n.vx = Math.abs(n.vx) }
        if (n.x > width - n.r) { n.x = width - n.r; n.vx = -Math.abs(n.vx) }
        if (n.y < n.r) { n.y = n.r; n.vy = Math.abs(n.vy) }
        if (n.y > height - n.r) { n.y = height - n.r; n.vy = -Math.abs(n.vy) }
        pushOut(n)
      }
    }

    function draw(dt) {
      ctx.clearRect(0, 0, width, height)

      // Links between nearby people; a ripple marks each newly formed one
      const links = []
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]
          const b = nodes[j]
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          if (d < LINK_DISTANCE) {
            const strength = 1 - d / LINK_DISTANCE
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.05 + strength * 0.22})`
            ctx.lineWidth = 1 + strength
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
            links.push([a, b])
            // only a clearly new connection gets a ripple (hysteresis + cap,
            // so bubbles jostling at a keep-out edge don't flicker rings)
            if (!a.linked.has(b) && d < LINK_DISTANCE * 0.8) {
              a.linked.add(b)
              if (dt > 0 && rings.length < MAX_RINGS) rings.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t: 0 })
            }
          } else {
            a.linked.delete(b)
          }
        }
      }

      rings = rings.filter((ring) => ring.t < 1)
      for (const ring of rings) {
        ring.t += dt / 1.4
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 * (1 - ring.t)})`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(ring.x, ring.y, 6 + ring.t * 30, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Messages hopping along links
      sincePulse += dt
      if (sincePulse > 0.55 && links.length > 0) {
        sincePulse = 0
        const [a, b] = links[Math.floor(Math.random() * links.length)]
        pulses.push(Math.random() < 0.5 ? { a, b, t: 0 } : { a: b, b: a, t: 0 })
      }
      pulses = pulses.filter((p) => p.t < 1)
      for (const p of pulses) {
        p.t += dt / 1.6
        const x = p.a.x + (p.b.x - p.a.x) * p.t
        const y = p.a.y + (p.b.y - p.a.y) * p.t
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)'
        ctx.beginPath()
        ctx.arc(x, y, 8, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = primary
        ctx.beginPath()
        ctx.arc(x, y, 4, 0, Math.PI * 2)
        ctx.fill()
      }

      // People
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (const n of nodes) {
        // no outline: accent bubbles are white with green initials so they
        // still stand out against the green background
        ctx.fillStyle = n.accent ? primaryInk : fills[n.fill]
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = n.accent ? primary : ink
        ctx.font = `700 ${Math.round(n.r * 0.62)}px ${font}`
        ctx.fillText(n.label, n.x, n.y + 0.5)
      }
    }

    function tick(now) {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      // the text block moves while fonts load and its entrance animation runs
      sinceAvoid += dt
      if (sinceAvoid > 0.5) {
        sinceAvoid = 0
        readAvoid()
      }
      move(dt)
      draw(dt)
      frame = requestAnimationFrame(tick)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    const themeWatch = new MutationObserver(() => {
      readTokens()
      if (still) draw(0)
    })
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    resize()
    if (!still) {
      last = performance.now()
      frame = requestAnimationFrame(tick)
    }
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      themeWatch.disconnect()
    }
  }, [])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
