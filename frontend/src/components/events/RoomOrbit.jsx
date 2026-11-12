import { useMemo, useRef, useState } from 'react'
import { assetUrl } from '../../api'
import { initials } from '../../lib/network'
import { Badge, Button, Icon } from '../ui'

// The room as your orbit: you are the centre, everyone else circles you on a
// ring that says what they are to you — strong ties closest, then connections,
// then expertise matches worth meeting, then the rest of the room on the rim.
// The field drifts slowly (names stay upright), hovering someone lights a
// beam and explains the tie, and clicking docks a card with actions.

const W = 760
const H = 560
const CX = W / 2
const CY = H / 2
const BANDS = [
  { r: 104, size: 50 },
  { r: 156, size: 44 },
  { r: 206, size: 40 },
  { r: 252, size: 34 },
]

const pct = (v, total) => `${(v / total) * 100}%`
const deg = (rad) => (rad * 180) / Math.PI

function bandOf(tie) {
  if (!tie) return 3
  if (tie.semantic) return 2
  return tie.weight >= 0.5 ? 0 : 1
}

function tieLabel(tie) {
  if (!tie) return 'No link with you yet'
  if (tie.semantic) return `${Math.round(tie.weight * 100)}% expertise match with you`
  return `Connected to you · ${Math.round(tie.weight * 100)}%`
}

export default function RoomOrbit({ nodes, edges, meId, focusTeam = null, isLive = false, onConnect, connectingId = null, isNew }) {
  // hover carries the bubble's real on-screen spot, so the explanation card
  // can live outside the clipped stage and never get cut off
  const [hot, setHot] = useState(null) // {id, x, top, bottom, width} | null
  const [selectedId, setSelectedId] = useState(null)
  const wrapRef = useRef(null)

  const me = nodes.find((n) => n.id === meId)

  // One spot per person: band by relationship to you, spread evenly round the
  // ring, strongest first, then relaxed apart so avatars and names never pile up.
  const placed = useMemo(() => {
    const ties = {}
    edges.forEach((e) => {
      if (e.a === meId) ties[e.b] = e
      else if (e.b === meId) ties[e.a] = e
    })
    const bands = [[], [], [], []]
    nodes.filter((n) => n.id !== meId).forEach((n) => bands[bandOf(ties[n.id])].push(n))
    const out = []
    bands.forEach((members, b) => {
      members.sort(
        (x, y) => (ties[y.id]?.weight || 0) - (ties[x.id]?.weight || 0) || x.id - y.id,
      )
      const step = (2 * Math.PI) / Math.max(members.length, 1)
      const offset = 0.9 + b * 1.15 // each ring starts at its own bearing
      members.forEach((n, i) => {
        const r = BANDS[b].r
        const a = offset + i * step
        out.push({
          node: n,
          tie: ties[n.id] || null,
          band: b,
          a,
          r,
          size: BANDS[b].size,
          x: CX + r * Math.cos(a),
          y: CY + r * Math.sin(a),
        })
      })
    })

    // nudge any two that would overlap (avatar + name need breathing room)
    for (let pass = 0; pass < 36; pass++) {
      let moved = false
      for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) {
          const a = out[i]
          const b = out[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const d = Math.hypot(dx, dy) || 0.01
          const need = (a.size + b.size) / 2 + 30
          if (d >= need) continue
          const push = (need - d) / 2
          const ux = dx / d
          const uy = dy / d
          a.x -= ux * push
          a.y -= uy * push
          b.x += ux * push
          b.y += uy * push
          moved = true
        }
      }
      if (!moved) break
    }
    out.forEach((p) => {
      // stay on the stage and clear of you in the middle
      const dx = p.x - CX
      const dy = p.y - CY
      const d = Math.hypot(dx, dy) || 0.01
      if (d < 86) {
        p.x = CX + (dx / d) * 86
        p.y = CY + (dy / d) * 86
      }
      p.x = Math.min(W - 44, Math.max(44, p.x))
      p.y = Math.min(H - 48, Math.max(40, p.y))
      // the beam follows the final spot
      p.a = Math.atan2(p.y - CY, p.x - CX)
      p.r = Math.hypot(p.x - CX, p.y - CY)
    })
    return out
  }, [nodes, edges, meId])

  const inFocus = (n) => focusTeam === null || n.org_unit === focusTeam
  const litId = hot?.id ?? selectedId
  const lit = litId != null ? placed.find((p) => p.node.id === litId) : null
  const hotPlaced = hot != null ? placed.find((p) => p.node.id === hot.id) : null
  const selected = selectedId != null ? placed.find((p) => p.node.id === selectedId) : null

  const showTip = (p) => (e) => {
    const wrap = wrapRef.current?.getBoundingClientRect()
    const r = e.currentTarget.getBoundingClientRect()
    if (!wrap) return
    setHot({
      id: p.node.id,
      x: r.left + r.width / 2 - wrap.left,
      top: r.top - wrap.top,
      bottom: r.bottom - wrap.top,
      width: wrap.width,
    })
  }
  const hideTip = (p) => () => setHot((cur) => (cur?.id === p.node.id ? null : cur))

  const tipBelow = hot != null && hot.top < 150
  const tipX = hot != null ? Math.min(Math.max(hot.x, 145), hot.width - 145) : 0

  return (
    <div className="orb" onClick={() => setSelectedId(null)}>
      <div className="orb__wrap" ref={wrapRef}>
        <div className="orb__stage" role="img" aria-label={`${nodes.length} people in the room, arranged by how connected they are to you`}>
          {isLive && (
            <>
              <i className="orb__glow" aria-hidden="true" />
              <i className="orb__breath" aria-hidden="true" />
            </>
          )}

          {BANDS.map((band) => (
            <i
              key={band.r}
              className="orb__ring"
              aria-hidden="true"
              style={{
                left: pct(CX - band.r, W),
                top: pct(CY - band.r, H),
                width: pct(band.r * 2, W),
                height: pct(band.r * 2, H),
              }}
            />
          ))}

          <div className="orb__field">
            {lit && (
              <i
                className="orb__beam"
                aria-hidden="true"
                style={{ width: pct(lit.r, W), transform: `rotate(${deg(lit.a)}deg)` }}
              />
            )}
            {placed.map((p, i) => {
              const dimmed = (litId != null && litId !== p.node.id) || !inFocus(p.node)
              return (
                <button
                  key={p.node.id}
                  type="button"
                  className={`orb__person ${litId === p.node.id ? 'orb__person--lit' : ''} ${dimmed ? 'orb__person--dim' : ''} ${p.node.has_profile ? '' : 'orb__person--ghost'}`}
                  style={{ left: pct(p.x, W), top: pct(p.y, H), '--size': `${p.size}px`, '--drift': `${4.5 + (i % 5) * 0.7}s` }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedId((cur) => (cur === p.node.id ? null : p.node.id))
                  }}
                  onPointerEnter={showTip(p)}
                  onPointerLeave={hideTip(p)}
                  onFocus={showTip(p)}
                  onBlur={hideTip(p)}
                  aria-label={`${p.node.name} — ${tieLabel(p.tie)}`}
                >
                  <span className="orb__counter">
                    <span className="orb__bob">
                      <span className="orb__av">
                        {p.node.avatar_url ? (
                          <img src={assetUrl(p.node.avatar_url)} alt="" draggable="false" />
                        ) : (
                          initials(p.node.name)
                        )}
                      </span>
                      {isNew?.(p.node) && <i className="orb__pulse" aria-hidden="true" />}
                      <span className="orb__name">{p.node.name.split(' ')[0]}</span>
                      {litId === p.node.id && p.tie && (
                        <span className="orb__chip">{Math.round(p.tie.weight * 100)}%</span>
                      )}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {/* you, the still centre of it all */}
          <div className="orb__you" aria-hidden="true">
            <span className="orb__av orb__av--you">
              {me?.avatar_url ? <img src={assetUrl(me.avatar_url)} alt="" draggable="false" /> : initials(me?.name || 'You')}
            </span>
            <span className="orb__name orb__name--you">You</span>
          </div>

          {selected && (
            <div className="orb__dock" onClick={(e) => e.stopPropagation()}>
              <span className="orb__av orb__av--dock">
                {selected.node.avatar_url ? (
                  <img src={assetUrl(selected.node.avatar_url)} alt="" draggable="false" />
                ) : (
                  initials(selected.node.name)
                )}
              </span>
              <span className="orb__dock-text">
                <b>{selected.node.name}</b>
                <small>
                  {selected.node.has_profile
                    ? [selected.node.title, selected.node.org_unit].filter(Boolean).join(' · ') || 'Profile set up'
                    : 'Profile pending'}
                </small>
                <small className="orb__dock-tie">
                  {tieLabel(selected.tie)}
                  {selected.tie && !selected.tie.semantic && selected.tie.evidence ? ` — ${selected.tie.evidence}` : ''}
                </small>
              </span>
              <span className="orb__dock-actions">
                {selected.node.has_profile && (
                  <Button to={`/people/${selected.node.id}`} variant="outline" size="sm">
                    Profile
                  </Button>
                )}
                {selected.node.has_profile &&
                  (selected.tie && !selected.tie.semantic ? (
                    <Badge tone="primary"><Icon name="check" size={12} /> Connected</Badge>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={connectingId !== null}
                      onClick={() => onConnect?.(selected.node)}
                    >
                      {connectingId === selected.node.id ? 'Connecting…' : 'Connect'}
                    </Button>
                  ))}
              </span>
              <button type="button" className="orb__dock-close" aria-label="Close" onClick={() => setSelectedId(null)}>
                ×
              </button>
            </div>
          )}
        </div>

        {/* hover explanation, floated above the stage so nothing clips it */}
        {hot && hotPlaced && (
          <span
            role="tooltip"
            className={`orb__tip ${tipBelow ? 'orb__tip--below' : ''}`}
            style={tipBelow ? { left: tipX, top: hot.bottom + 10 } : { left: tipX, top: hot.top - 10 }}
          >
            <b>{hotPlaced.node.name}</b>
            <span>
              {hotPlaced.node.has_profile
                ? [hotPlaced.node.title, hotPlaced.node.org_unit].filter(Boolean).join(' · ') || 'Profile set up'
                : 'Profile pending'}
            </span>
            <span className="orb__tip-tie">
              {tieLabel(hotPlaced.tie)}
              {hotPlaced.tie && !hotPlaced.tie.semantic && hotPlaced.tie.evidence
                ? ` — ${hotPlaced.tie.evidence}`
                : ''}
            </span>
            <span className="orb__tip-hint">Click for profile &amp; connect</span>
          </span>
        )}
      </div>

      <p className="orb__hint" aria-hidden="true">
        The closer to you, the stronger the tie · tap anyone to connect
      </p>
      {/* screen-reader fallback for the purely visual hint */}
      <span className="sr-only">People closer to the centre are more strongly connected to you. Select a person to view their profile or connect.</span>
    </div>
  )
}
