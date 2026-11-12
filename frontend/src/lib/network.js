// Pure helpers for the network view: layout, paths and the words around them.

// Design-space the graph is laid out in; rendered as percentages so it scales.
export const GRAPH_W = 760
export const GRAPH_H = 640

// Ring radii [x, y] per hop count. Hops 3–4 only appear when a search result
// is further out, so they share a flattened outer ring.
const RINGS = [[0, 0], [140, 140], [250, 250], [335, 292], [335, 292]]

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
