import { useMemo, useRef, useState } from 'react'

// Small single-hue charts for the admin overview. One hue (--primary) because
// every job here is magnitude, not identity; values are always visible without
// hover (end labels / bar tips), so tooltips enhance rather than gate.

const fmt = (n) => Number(n).toLocaleString()

function niceTicks(max) {
  if (max <= 0) return [0, 1]
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].find((s) => max / s <= 4) || 2000
  const top = Math.ceil(max / step) * step
  const ticks = []
  for (let v = 0; v <= top; v += step) ticks.push(v)
  return ticks
}

const dayLabel = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

// Area chart for one series over days, with a snapping crosshair + tooltip.
// Keyboard: focus the chart, arrow keys walk the days.
export function AreaChart({ title, data }) {
  const [active, setActive] = useState(null) // index into data
  const svgRef = useRef(null)

  const W = 560
  const H = 170
  const PAD = { top: 14, right: 46, bottom: 24, left: 30 }

  const model = useMemo(() => {
    const counts = data.map((d) => Number(d.count))
    const ticks = niceTicks(Math.max(...counts, 1))
    const top = ticks[ticks.length - 1]
    const x = (i) => PAD.left + (i / Math.max(1, data.length - 1)) * (W - PAD.left - PAD.right)
    const y = (v) => PAD.top + (1 - v / top) * (H - PAD.top - PAD.bottom)
    const pts = counts.map((c, i) => [x(i), y(c)])
    const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('')
    const area = `${line}L${pts[pts.length - 1][0].toFixed(1)} ${y(0)}L${pts[0][0].toFixed(1)} ${y(0)}Z`
    return { counts, ticks, top, x, y, pts, line, area }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  function indexFromPointer(e) {
    const rect = svgRef.current.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const span = (W - PAD.left - PAD.right) / Math.max(1, data.length - 1)
    return Math.min(data.length - 1, Math.max(0, Math.round((px - PAD.left) / span)))
  }

  function onKey(e) {
    if (e.key === 'Escape') return setActive(null)
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    setActive((a) => {
      const base = a ?? data.length - 1
      return Math.min(data.length - 1, Math.max(0, base + (e.key === 'ArrowRight' ? 1 : -1)))
    })
  }

  const last = data.length - 1
  const a = active
  const summary = `${title}: ${data.map((d) => `${dayLabel(d.day)} ${d.count}`).join(', ')}`

  return (
    <figure className="viz" role="group" aria-label={summary}>
      <figcaption className="viz__title">{title}</figcaption>
      <div className="viz__plot">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="viz__svg"
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          onPointerMove={(e) => setActive(indexFromPointer(e))}
          onPointerLeave={() => setActive(null)}
        >
          {model.ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={model.y(t)} y2={model.y(t)} className="viz-grid" />
              <text x={PAD.left - 7} y={model.y(t) + 3.5} textAnchor="end" className="viz-tick">{fmt(t)}</text>
            </g>
          ))}
          {[0, Math.floor(last / 2), last].map((i) => (
            <text key={i} x={model.x(i)} y={H - 7} textAnchor="middle" className="viz-tick">
              {dayLabel(data[i].day)}
            </text>
          ))}

          <path d={model.area} className="viz-area" />
          <path d={model.line} className="viz-line" />

          {/* end marker + its value, always visible */}
          <circle cx={model.pts[last][0]} cy={model.pts[last][1]} r="4.5" className="viz-dot" />
          <text x={model.pts[last][0] + 9} y={model.pts[last][1] + 4} className="viz-endlabel">
            {fmt(model.counts[last])}
          </text>

          {a !== null && (
            <g>
              <line x1={model.pts[a][0]} x2={model.pts[a][0]} y1={PAD.top} y2={model.y(0)} className="viz-crosshair" />
              <circle cx={model.pts[a][0]} cy={model.pts[a][1]} r="4.5" className="viz-dot" />
            </g>
          )}
        </svg>
        {a !== null && (
          <div
            className="viz-tip"
            style={{ left: `${(model.pts[a][0] / W) * 100}%`, '--flip': a > data.length * 0.7 ? 1 : 0 }}
            role="status"
          >
            <strong>{fmt(model.counts[a])}</strong>
            <span>{dayLabel(data[a].day)}</span>
          </div>
        )}
      </div>
    </figure>
  )
}

// Horizontal bars, one hue, value at the tip; whole row is the hit target.
export function BarList({ title, data, labelOf, valueOf }) {
  const [active, setActive] = useState(null)
  const rows = data.map((d) => ({ label: labelOf(d), value: Number(valueOf(d)) }))
  const max = Math.max(...rows.map((r) => r.value), 1)
  const total = rows.reduce((s, r) => s + r.value, 0)

  return (
    <figure className="viz" role="group" aria-label={`${title}: ${rows.map((r) => `${r.label} ${r.value}`).join(', ')}`}>
      <figcaption className="viz__title">{title}</figcaption>
      <div className="viz-bars">
        {rows.map((r, i) => (
          <div
            key={r.label}
            className={`viz-bar ${active === i ? 'viz-bar--hot' : ''}`}
            tabIndex={0}
            onPointerEnter={() => setActive(i)}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          >
            <span className="viz-bar__label">{r.label}</span>
            <span className="viz-bar__track">
              <span className="viz-bar__fill" style={{ width: `${(r.value / max) * 100}%` }} />
            </span>
            <span className="viz-bar__value">{fmt(r.value)}</span>
            {active === i && total > 0 && (
              <span className="viz-tip viz-tip--bar" role="status">
                <strong>{fmt(r.value)}</strong>
                <span>{Math.round((r.value / total) * 100)}% of {fmt(total)}</span>
              </span>
            )}
          </div>
        ))}
      </div>
    </figure>
  )
}
