import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

// Categorical palette anchored on the brand teal, validated with the dataviz
// six-checks script (lightness band, chroma floor, CVD >= 8 adjacent, normal
// vision >= 15, contrast >= 3:1 on white). Hues are assigned in this fixed
// order, never cycled.
export const CHART_COLORS = [
  '#0E8F75', '#CC8226', '#3E6FB0', '#C25E4C', '#7A5FB5', '#6B7F23', '#C9568F', '#9A5F1E',
]
const ACCENT = CHART_COLORS[0]
const INK = 'var(--secondary)'
const MUTED = 'var(--secondary-muted)'
const GRID = 'var(--ds-line)'

const fmt = (n) => Number(n).toLocaleString()
const dayLabel = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

// Week-over-week movement pill: ▲/▼ + % (or absolute when the base is 0).
function DeltaPill({ now, before, noun = 'prior week' }) {
  if (now === before) return <span className="viz-delta viz-delta--flat">— same as {noun}</span>
  const up = now > before
  const text = before > 0 ? `${Math.round((Math.abs(now - before) / before) * 100)}%` : `${fmt(Math.abs(now - before))}`
  return (
    <span className={`viz-delta ${up ? 'viz-delta--up' : 'viz-delta--down'}`}>
      {up ? '▲' : '▼'} {text} vs {noun}
    </span>
  )
}

// Shared card header: title + context on the left, headline figure on the right.
function VizHead({ title, sub, value, unit, delta }) {
  return (
    <figcaption className="viz-head">
      <div className="viz-head__text">
        <span className="viz-head__title">{title}</span>
        {sub && <span className="viz-head__sub">{sub}</span>}
      </div>
      <div className="viz-head__figure">
        <strong>{fmt(value)}</strong>
        {unit && <span className="viz-head__unit">{unit}</span>}
        {delta}
      </div>
    </figcaption>
  )
}

// Dark pill tooltip. Values lead, labels follow; recharts positions it at the cursor.
function ChartTip({ active, payload, label, labelFormatter, detail }) {
  if (!active || !payload?.length) return null
  const value = payload[0].value
  return (
    <div className="viz-tip" role="status">
      <strong>{fmt(value)}</strong>
      <span>{labelFormatter ? labelFormatter(label, payload) : label}</span>
      {detail && <em>{detail(value, label)}</em>}
    </div>
  )
}

// Event joins over the last 14 days: gradient area, crosshair + cursor tooltip,
// the peak day direct-labeled, headline total + week-over-week delta up top.
export function JoinsArea({ data }) {
  const rows = useMemo(() => data.map((d) => ({ ...d, count: Number(d.count) })), [data])
  const total = rows.reduce((s, r) => s + r.count, 0)
  const last7 = rows.slice(-7).reduce((s, r) => s + r.count, 0)
  const prev7 = rows.slice(-14, -7).reduce((s, r) => s + r.count, 0)
  const peak = rows.reduce((best, r) => (r.count > best.count ? r : best), rows[0] || { count: 0 })
  const flat = rows.every((r) => r.count === rows[0]?.count)
  const summary = rows.map((d) => `${dayLabel(d.day)} ${d.count}`).join(', ')
  return (
    <figure className="viz" role="group" aria-label={`Event joins by day, ${fmt(total)} total: ${summary}`}>
      <VizHead
        title="Event joins"
        sub="Last 14 days"
        value={total}
        delta={<DeltaPill now={last7} before={prev7} />}
      />
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={rows} margin={{ top: 22, right: 14, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="joinsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.3} />
              <stop offset="60%" stopColor={ACCENT} stopOpacity={0.08} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={dayLabel}
            ticks={[rows[0]?.day, rows[Math.floor(rows.length / 2)]?.day, rows[rows.length - 1]?.day]}
            tick={{ fontSize: 10.5, fill: MUTED }}
            axisLine={{ stroke: GRID }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            width={44}
            tickCount={4}
            tick={{ fontSize: 10.5, fill: MUTED }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={
              <ChartTip
                labelFormatter={(l) => dayLabel(l)}
                detail={(v) => (total > 0 ? `${Math.round((v / total) * 100)}% of all joins` : null)}
              />
            }
            cursor={{ stroke: 'var(--ds-line-strong)', strokeWidth: 1 }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke={ACCENT}
            strokeWidth={2}
            fill="url(#joinsFill)"
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--ds-surface)', fill: ACCENT }}
            animationDuration={900}
          />
          {!flat && peak.count > 0 && (
            <ReferenceDot
              x={peak.day}
              y={peak.count}
              r={4}
              fill={ACCENT}
              stroke="var(--ds-surface)"
              strokeWidth={2}
              isFront
              label={{
                value: `Peak · ${fmt(peak.count)}`,
                position: 'top',
                fill: INK,
                fontSize: 11,
                fontWeight: 600,
                dy: -2,
              }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </figure>
  )
}

// People by team: one measure, so one hue (the brand accent) — bar length does
// the comparing. Hover lifts a row, dims the rest, and floats count + share.
export function TeamBars({ data }) {
  const rows = useMemo(() => data.map((d) => ({ unit: d.unit, count: Number(d.count) })), [data])
  const [hot, setHot] = useState(null)
  const total = rows.reduce((s, r) => s + r.count, 0)
  const max = Math.max(...rows.map((r) => r.count), 1)
  const summary = rows.map((d) => `${d.unit} ${d.count}`).join(', ')
  return (
    <figure className="viz" role="group" aria-label={`People by team: ${summary}`}>
      <VizHead title="People by team" sub={`${rows.length} teams`} value={total} unit="people" />
      <div
        className={`viz-bars ${hot !== null ? 'viz-bars--dim' : ''}`}
        onMouseLeave={() => setHot(null)}
      >
        {rows.map((row, i) => {
          const share = total > 0 ? Math.round((row.count / total) * 100) : 0
          return (
            <div
              key={row.unit}
              className={`viz-bar ${hot === i ? 'viz-bar--hot' : ''}`}
              style={{ '--i': i }}
              tabIndex={0}
              aria-label={`${row.unit}: ${fmt(row.count)} people, ${share}% of the network`}
              onMouseEnter={() => setHot(i)}
              onFocus={() => setHot(i)}
              onBlur={() => setHot(null)}
            >
              <span className="viz-bar__label">{row.unit}</span>
              <span className="viz-bar__track">
                <span className="viz-bar__fill" style={{ width: `${(row.count / max) * 100}%`, background: ACCENT }} />
              </span>
              <span className="viz-bar__value">{fmt(row.count)}</span>
              {hot === i && (
                <span className="viz-tip viz-tip--bar" role="status">
                  <strong>{fmt(row.count)}</strong>
                  <span>{row.unit}</span>
                  <em>{share}% of people</em>
                </span>
              )}
            </div>
          )
        })}
      </div>
    </figure>
  )
}

// How people are connected: one whole split into parts — a tall segmented bar
// (never a donut). Hovering a segment or its legend row highlights both; shares
// print inside segments wide enough to hold them.
export function ConnectionsSplit({ data, labels }) {
  const rows = useMemo(
    () => data.map((d) => ({ key: d.type, label: labels[d.type] || d.type, count: Number(d.count) })),
    [data, labels],
  )
  const [hot, setHot] = useState(null)
  const total = rows.reduce((s, r) => s + r.count, 0) || 1
  let offset = 0
  const parts = rows.map((r) => {
    const share = (r.count / total) * 100
    const part = { ...r, share, start: offset }
    offset += share
    return part
  })
  const summary = parts.map((r) => `${r.label} ${Math.round(r.share)}%`).join(', ')
  return (
    <figure className="viz" role="group" aria-label={`How people are connected: ${summary}`}>
      <VizHead title="How people are connected" sub={`${rows.length} tie types`} value={total} unit="ties" />
      <div className={`viz-split ${hot !== null ? 'viz-split--dim' : ''}`} role="img" aria-label={summary} onMouseLeave={() => setHot(null)}>
        {parts.map((r, i) => (
          <span
            key={r.key}
            className={`viz-split__part ${hot === i ? 'viz-split__part--hot' : ''}`}
            style={{ width: `${r.share}%`, background: CHART_COLORS[i % CHART_COLORS.length], '--i': i }}
            tabIndex={0}
            aria-label={`${r.label}: ${fmt(r.count)}, ${Math.round(r.share)}%`}
            onMouseEnter={() => setHot(i)}
            onFocus={() => setHot(i)}
            onBlur={() => setHot(null)}
          >
            {r.share >= 9 && <em>{Math.round(r.share)}%</em>}
          </span>
        ))}
        {hot !== null && (
          <span
            className="viz-tip viz-tip--split"
            style={{ left: `${Math.min(86, Math.max(10, parts[hot].start + parts[hot].share / 2))}%` }}
            role="status"
          >
            <strong>{fmt(parts[hot].count)}</strong>
            <span>{parts[hot].label}</span>
            <em>{Math.round(parts[hot].share)}%</em>
          </span>
        )}
      </div>
      <ul className="viz-legend" onMouseLeave={() => setHot(null)}>
        {parts.map((r, i) => (
          <li
            key={r.key}
            className={hot !== null && hot !== i ? 'viz-legend__item--dim' : ''}
            onMouseEnter={() => setHot(i)}
          >
            <i style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            {r.label}
            <b>{fmt(r.count)}</b>
          </li>
        ))}
      </ul>
    </figure>
  )
}

// Tiny trend for an event card; purely decorative support (count sits beside it).
export function Sparkline({ data, color = CHART_COLORS[0] }) {
  const rows = data.map((n, i) => ({ i, n: Number(n) }))
  const flat = rows.every((r) => r.n === 0)
  if (flat) return <span className="spark spark--flat" aria-hidden="true" />
  return (
    <span className="spark" aria-hidden="true">
      <ResponsiveContainer width="100%" height={34}>
        <AreaChart data={rows} margin={{ top: 3, right: 0, bottom: 0, left: 0 }}>
          <Area type="monotone" dataKey="n" stroke={color} strokeWidth={1.6} fill={color} fillOpacity={0.14} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </span>
  )
}
