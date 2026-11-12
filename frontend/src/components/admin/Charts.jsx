import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useCountUp } from '../../hooks/useCountUp'

// Categorical palette anchored on the brand teal, validated with the dataviz
// six-checks script (CVD-safe adjacent pairs, contrast >= 3:1 on white).
// Hues are assigned in this fixed order, never cycled.
export const CHART_COLORS = [
  '#0E8F75', '#CC8226', '#3E6FB0', '#C25E4C', '#7A5FB5', '#6B7F23', '#C9568F', '#9A5F1E',
]
const ACCENT = CHART_COLORS[0]
const MINT = '#35E0C2' // the hero line on the dark panel
const HERO_INK = '#ECFDF5'
const HERO_MUTED = 'rgba(236, 253, 245, 0.55)'
const HERO_GRID = 'rgba(236, 253, 245, 0.09)'

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

// Shared card header: title + context on the left, counted-up headline right.
function VizHead({ title, sub, value, unit, delta }) {
  const counted = useCountUp(value)
  return (
    <figcaption className="viz-head">
      <div className="viz-head__text">
        <span className="viz-head__title">{title}</span>
        {sub && <span className="viz-head__sub">{sub}</span>}
      </div>
      <div className="viz-head__figure">
        <strong>{fmt(counted)}</strong>
        {unit && <span className="viz-head__unit">{unit}</span>}
        {delta}
      </div>
    </figcaption>
  )
}

// Dark pill tooltip. Values lead, labels follow; recharts floats it at the cursor.
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

// "Live" endpoint: a pulsing ring around the latest data point.
function PulseDot({ cx, cy }) {
  if (cx == null || cy == null) return null
  return (
    <g className="viz-pulse">
      <circle className="viz-pulse__ring" cx={cx} cy={cy} r={9} fill={MINT} />
      <circle cx={cx} cy={cy} r={4} fill={MINT} stroke="#0E2B28" strokeWidth={2} />
    </g>
  )
}

// Event joins over the last 14 days: a dark aurora panel, glowing mint line,
// pulsing live endpoint, direct-labeled peak, crosshair + cursor tooltip.
export function JoinsArea({ data }) {
  const rows = useMemo(() => data.map((d) => ({ ...d, count: Number(d.count) })), [data])
  const total = rows.reduce((s, r) => s + r.count, 0)
  const last7 = rows.slice(-7).reduce((s, r) => s + r.count, 0)
  const prev7 = rows.slice(-14, -7).reduce((s, r) => s + r.count, 0)
  const last = rows[rows.length - 1]
  const peak = rows.reduce((best, r) => (r.count > best.count ? r : best), rows[0] || { count: 0 })
  const flat = rows.every((r) => r.count === rows[0]?.count)
  const summary = rows.map((d) => `${dayLabel(d.day)} ${d.count}`).join(', ')
  return (
    <figure className="viz viz--hero" role="group" aria-label={`Event joins by day, ${fmt(total)} total: ${summary}`}>
      <VizHead
        title="Event joins"
        sub="Last 14 days"
        value={total}
        delta={<DeltaPill now={last7} before={prev7} />}
      />
      <ResponsiveContainer width="100%" height={230}>
        <AreaChart data={rows} margin={{ top: 26, right: 18, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="joinsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={MINT} stopOpacity={0.52} />
              <stop offset="55%" stopColor={MINT} stopOpacity={0.14} />
              <stop offset="100%" stopColor={MINT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={HERO_GRID} vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={dayLabel}
            ticks={[rows[0]?.day, rows[Math.floor(rows.length / 2)]?.day, rows[rows.length - 1]?.day]}
            tick={{ fontSize: 10.5, fill: HERO_MUTED }}
            axisLine={{ stroke: HERO_GRID }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            width={42}
            tickCount={4}
            tick={{ fontSize: 10.5, fill: HERO_MUTED }}
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
            cursor={{ stroke: 'rgba(236, 253, 245, 0.3)', strokeWidth: 1 }}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="count"
            className="viz-hero-line"
            stroke={MINT}
            strokeWidth={2.5}
            fill="url(#joinsFill)"
            dot={false}
            activeDot={{ r: 5.5, strokeWidth: 2, stroke: '#0E2B28', fill: MINT }}
            animationDuration={1100}
          />
          {!flat && peak.count > 0 && peak.day !== last?.day && (
            <ReferenceDot
              x={peak.day}
              y={peak.count}
              r={4}
              fill={MINT}
              stroke="#0E2B28"
              strokeWidth={2}
              isFront
              label={{
                value: `Peak · ${fmt(peak.count)}`,
                position: 'top',
                fill: HERO_INK,
                fontSize: 11,
                fontWeight: 600,
                dy: -2,
              }}
            />
          )}
          {last && !flat && (
            <ReferenceDot x={last.day} y={last.count} isFront shape={<PulseDot />} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </figure>
  )
}

// People by team: one measure, one gradient hue — bar length does the comparing.
// Bars grow in with a stagger and a shine sweep; hover lifts a row, dims the
// rest, and floats count + share.
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
                <span className="viz-bar__fill" style={{ width: `${(row.count / max) * 100}%` }} />
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

// How people are connected: an animated ring — arcs sweep in, hovering an arc
// (or its legend row) expands it and swaps the live readout in the center.
export function ConnectionsSplit({ data, labels }) {
  const rows = useMemo(
    () => data.map((d) => ({ key: d.type, label: labels[d.type] || d.type, count: Number(d.count) })),
    [data, labels],
  )
  const [hot, setHot] = useState(null)
  const total = rows.reduce((s, r) => s + r.count, 0) || 1
  const counted = useCountUp(total)
  const summary = rows
    .map((r) => `${r.label} ${fmt(r.count)} (${Math.round((r.count / total) * 100)}%)`)
    .join(', ')
  const active = hot !== null ? rows[hot] : null
  return (
    <figure className="viz" role="group" aria-label={`How people are connected: ${summary}`}>
      <div className="viz-head">
        <div className="viz-head__text">
          <span className="viz-head__title">How people are connected</span>
          <span className="viz-head__sub">{rows.length} tie types</span>
        </div>
      </div>
      <div className="viz-donut" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height={216}>
          <PieChart>
            <Pie
              data={rows}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="66%"
              outerRadius="88%"
              paddingAngle={3}
              cornerRadius={7}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              animationDuration={950}
              onMouseEnter={(_, i) => setHot(i)}
              onMouseLeave={() => setHot(null)}
            >
              {rows.map((r, i) => (
                <Cell
                  key={r.key}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  className={
                    hot === i ? 'donut-cell--hot' : hot !== null ? 'donut-cell--dim' : ''
                  }
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="viz-donut__center" aria-hidden="true">
          {active ? (
            <>
              <strong>{fmt(active.count)}</strong>
              <span>{active.label}</span>
              <em style={{ color: CHART_COLORS[hot % CHART_COLORS.length] }}>
                {Math.round((active.count / total) * 100)}% of ties
              </em>
            </>
          ) : (
            <>
              <strong>{fmt(counted)}</strong>
              <span>ties in the network</span>
            </>
          )}
        </div>
      </div>
      <ul className="viz-legend" onMouseLeave={() => setHot(null)}>
        {rows.map((r, i) => (
          <li
            key={r.key}
            className={hot !== null && hot !== i ? 'viz-legend__item--dim' : ''}
            tabIndex={0}
            aria-label={`${r.label}: ${fmt(r.count)}, ${Math.round((r.count / total) * 100)}%`}
            onMouseEnter={() => setHot(i)}
            onFocus={() => setHot(i)}
            onBlur={() => setHot(null)}
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
