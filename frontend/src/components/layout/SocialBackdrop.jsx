import { useEffect, useRef } from 'react'

// Animated "people finding each other" backdrop: drifting avatar bubbles that
// link up when they come close, with messages travelling along the links.
// Purely decorative. Brand colours are read from the theme tokens, and the
// animation is replaced by a single still frame under prefers-reduced-motion.

const INITIALS = ['NA', 'WL', 'HR', 'SL', 'AN', 'JT', 'DK', 'PS', 'KM', 'RB', 'EL', 'TM', 'YB', 'CM', 'AS', 'TF']
const PASTELS = ['#FBE3DF', '#FFF1C9', '#DDEFE3', '#DCE8F7', '#EDE3F7', '#FDE7D2']
const LINK_DISTANCE = 190
const rand = (min, max) => min + Math.random() * (max - min)

export default function SocialBackdrop({ className = '' }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    const tokens = getComputedStyle(document.documentElement)
    const primary = tokens.getPropertyValue('--primary').trim() || '#9E3B33'
    const primaryInk = tokens.getPropertyValue('--primary-ink').trim() || '#FFFFFF'
    const ink = tokens.getPropertyValue('--secondary').trim() || '#1B1613'
    const font = tokens.getPropertyValue('--ds-font').trim() || 'sans-serif'
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let width = 0
    let height = 0
    let nodes = []
    let pulses = [] // messages travelling a -> b
    let rings = [] // "new connection" ripples
    let frame = 0
    let last = 0
    let sincePulse = 0

    function seed() {
      const compact = height < 260 // phone banner: fewer, smaller bubbles
      const count = Math.max(5, Math.min(30, Math.round((width * height) / 30000)))
      nodes = Array.from({ length: count }, (_, i) => ({
        x: rand(40, width - 40),
        y: rand(40, height - 40),
        vx: rand(-12, 12),
        vy: rand(-12, 12),
        r: compact ? rand(12, 18) : rand(15, 26),
        label: INITIALS[i % INITIALS.length],
        accent: i % 5 === 0,
        fill: PASTELS[i % PASTELS.length],
        linked: new Set(),
      }))
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
            if (!a.linked.has(b)) {
              a.linked.add(b)
              if (dt > 0) rings.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t: 0 })
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
        ctx.fillStyle = n.accent ? primary : n.fill
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = ink
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.fillStyle = n.accent ? primaryInk : ink
        ctx.font = `700 ${Math.round(n.r * 0.62)}px ${font}`
        ctx.fillText(n.label, n.x, n.y + 0.5)
      }
    }

    function tick(now) {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      move(dt)
      draw(dt)
      frame = requestAnimationFrame(tick)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    if (!still) {
      last = performance.now()
      frame = requestAnimationFrame(tick)
    }
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
