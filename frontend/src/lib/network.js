// Pure helpers for the network view: layout, paths and the words around them.

// Design-space the graph is laid out in; rendered as percentages so it scales.
export const GRAPH_W = 760
export const GRAPH_H = 640

// Ring radii [x, y] per hop count, one per degree of connection (up to 6).
// Outer rings flatten vertically so they stay inside the canvas.
const RINGS = [
  [0, 0], [115, 115], [195, 195], [262, 240], [315, 272], [352, 294], [376, 306],
]
export const FLAT_RINGS = [RINGS[1][0], RINGS[2][0], RINGS[3][0]] // hop rings drawn in both views

export function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || ''
}

export function ordinal(hops) {
  return ['', '1st', '2nd', '3rd'][hops] || `${hops}th`
}

// {id: {x, y}} — requester in the middle, each person fanned out from the
// person who connects them (`via`).
export function layoutNodes(nodes) {
  const pos = {}
  const kids = {}
  nodes.forEach((n) => {
    if (n.via != null) (kids[n.via] ??= []).push(n)
  })
  const root = nodes.find((n) => n.depth === 0)
  if (!root) return pos
  const cx = GRAPH_W / 2
  const cy = GRAPH_H / 2
  pos[root.id] = { x: cx, y: cy }

  const first = kids[root.id] || []
  const sector = 360 / Math.max(first.length, 1)

  function place(node, angle, depth) {
    const [rx, ry] = RINGS[Math.min(depth, RINGS.length - 1)]
    const rad = (angle * Math.PI) / 180
    pos[node.id] = { x: cx + rx * Math.cos(rad), y: cy + ry * Math.sin(rad) }
    const children = kids[node.id] || []
    const step = depth === 1 ? Math.min(26, sector / Math.max(children.length, 1)) : 13
    children.forEach((child, j) => {
      const nudge = depth >= 3 ? 9 : 0 // keep hop 4 off hop 3 on the shared ring
      place(child, angle + (j - (children.length - 1) / 2) * step + nudge, depth + 1)
    })
  }
  first.forEach((n, i) => place(n, -30 + i * sector, 1))
  return pos
}

// Sphere layout: {id: {x, y, z}} with the requester (the sun) at the centre.
// Direct connections sit evenly spaced on an inner shell; the people each of
// them can introduce sit on an outer shell, clustered near their introducer.
// Positions are fixed relative to each other - the view turns the whole sphere
// as one - so people can never drift into one another. One shell per degree.
export const SHELLS = [0, 160, 250, 310, 348, 372, 388]
const MAX_SHELL = SHELLS.length - 1
const DEG = Math.PI / 180
const GOLDEN = 137.508 * DEG

const unit = (v) => {
  const len = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })

// A direction `angle` away from `dir`, at compass bearing `around` it
function lean(dir, angle, around) {
  const u = unit(cross(dir, Math.abs(dir.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 }))
  const v = cross(dir, u)
  const side = Math.sin(angle)
  const fwd = Math.cos(angle)
  return unit({
    x: dir.x * fwd + (u.x * Math.cos(around) + v.x * Math.sin(around)) * side,
    y: dir.y * fwd + (u.y * Math.cos(around) + v.y * Math.sin(around)) * side,
    z: dir.z * fwd + (u.z * Math.cos(around) + v.z * Math.sin(around)) * side,
  })
}

// Push directions on the same shell apart until none are closer than `minAngle`
function spreadApart(items, minAngle) {
  const minDot = Math.cos(minAngle)
  for (let pass = 0; pass < 60; pass++) {
    let moved = false
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i].dir
        const b = items[j].dir
        if (a.x * b.x + a.y * b.y + a.z * b.z <= minDot) continue
        const push = { x: (a.x - b.x) * 0.25 + 1e-4, y: (a.y - b.y) * 0.25, z: (a.z - b.z) * 0.25 }
        items[i].dir = unit({ x: a.x + push.x, y: a.y + push.y, z: a.z + push.z })
        items[j].dir = unit({ x: b.x - push.x, y: b.y - push.y, z: b.z - push.z })
        moved = true
      }
    }
    if (!moved) break
  }
}

export function sphereLayout(nodes) {
  const kids = {}
  nodes.forEach((n) => {
    if (n.via != null) (kids[n.via] ??= []).push(n)
  })
  const root = nodes.find((n) => n.depth === 0)
  const points = {}
  if (!root) return points
  points[root.id] = { x: 0, y: 0, z: 0 }

  // Inner shell: an even (Fibonacci) spread over the whole sphere
  const planets = (kids[root.id] || []).map((node, i, all) => {
    const y = all.length > 1 ? 0.86 * (1 - (2 * (i + 0.5)) / all.length) : 0
    const ring = Math.sqrt(1 - y * y)
    return { node, dir: { x: ring * Math.cos(i * GOLDEN), y, z: ring * Math.sin(i * GOLDEN) } }
  })

  // Outer shells: each person leans away from the one who connects them
  const byShell = { 1: planets }
  for (let s = 2; s <= MAX_SHELL; s++) byShell[s] = []
  function addMoons(parent, depth) {
    const children = kids[parent.node.id] || []
    children.forEach((node, j) => {
      const angle = (depth === 2 ? (children.length > 1 ? 34 : 20) : depth === 3 ? 16 : 12) * DEG
      const around = (2 * Math.PI * j) / children.length + parent.node.id
      const item = { node, dir: lean(parent.dir, angle, around) }
      byShell[Math.min(depth, MAX_SHELL)].push(item)
      addMoons(item, depth + 1)
    })
  }
  planets.forEach((planet) => addMoons(planet, 2))
  const MIN_GAPS = { 2: 31, 3: 22, 4: 17, 5: 14, 6: 12 } // degrees apart per shell
  for (let s = 2; s <= MAX_SHELL; s++) spreadApart(byShell[s], (MIN_GAPS[s] || 12) * DEG)

  for (let shell = 1; shell <= MAX_SHELL; shell++) {
    for (const { node, dir } of byShell[shell]) {
      const r = SHELLS[shell]
      points[node.id] = { x: dir.x * r, y: dir.y * r, z: dir.z * r }
    }
  }
  return points
}

// Ids from the requester to `targetId`, following `via`. [] if not in the graph.
export function pathTo(nodesById, targetId) {
  const path = []
  let cur = nodesById[targetId]
  while (cur && path.length < 8) {
    path.unshift(cur.id)
    cur = cur.via != null ? nodesById[cur.via] : null
  }
  return path.length > 0 && nodesById[path[0]]?.depth === 0 ? path : []
}

const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`)

export function evidenceIndex(edges) {
  const index = {}
  edges.forEach((e) => {
    index[pairKey(e.a, e.b)] = e.evidence
  })
  return (a, b) => index[pairKey(a, b)] || 'connected'
}

// One line explaining how the requester reaches the selected person.
export function describePath(path, nodesById, evidence) {
  const hops = path.length - 1
  if (hops < 1) return 'No warm path yet — this would be cold outreach'
  if (hops === 1) return `1st connection · ${evidence(path[0], path[1])}`
  if (hops === 2) {
    const via = nodesById[path[1]]
    return `2 hops · via ${via.name} (${evidence(path[0], path[1])}) · ${evidence(path[1], path[2])}`
  }
  const chain = path.slice(1).map((id) => nodesById[id].name)
  return `${hops} hops · You → ${chain.join(' → ')}`
}

export function ctaLabel(path, nodesById) {
  const hops = path.length - 1
  if (hops < 1) return 'Draft a cold message'
  if (hops === 1) return 'Message'
  return `Ask ${firstName(nodesById[path[1]].name)} for an intro`
}

// The message the call-to-action copies to the clipboard.
export function draftMessage(path, nodesById, target, need) {
  const hops = path.length - 1
  const about = need ? ` I'm looking for help with "${need}".` : ''
  if (hops <= 1) {
    return `Hi ${firstName(target.name)},${about} Would you have 15 minutes to chat this week?`
  }
  const via = nodesById[path[1]]
  return (
    `Hi ${firstName(via.name)},${about} ${target.name}` +
    `${target.title ? ` (${target.title})` : ''} looks like the right person to talk to. ` +
    `Would you be open to introducing us?`
  )
}
