import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

// Categorical palette validated with the dataviz checker (CVD + contrast pass
// against the white surface). Hues are assigned in this fixed order, never cycled.
export const CHART_COLORS = [
  '#9E3B33', '#0E9AAB', '#C0791B', '#1F6FA8', '#D9608F', '#1F7A42', '#6B4FC8', '#6B7F23',
]
const INK = 'var(--secondary)'
const MUTED = 'var(--secondary-muted)'
const GRID = 'var(--ds-line)'

const fmt = (n) => Number(n).toLocaleString()
const dayLabel = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

// Dark pill tooltip, matching the app's snackbars. Values lead, labels follow.
function ChartTip({ active, payload, label, labelFormatter }) {
  if (!active || !payload?.length) return null
  return (
    <div className="viz-tip viz-tip--float" role="status">
      <strong>{fmt(payload[0].value)}</strong>
      <span>{labelFormatter ? labelFormatter(label, payload) : label}</span>
    </div>
  )
}

// Event joins over the last 14 days: gradient area, crosshair tooltip.
export function JoinsArea({ data }) {
  const rows = data.map((d) => ({ ...d, count: Number(d.count) }))
  const summary = rows.map((d) => `${dayLabel(d.day)} ${d.count}`).join(', ')
  return (
    <figure className="viz" role="group" aria-label={`Event joins by day: ${summary}`}>
      <figcaption className="viz__title">Event joins — last 14 days</figcaption>
      <ResponsiveContainer width="100%" height={190}>
        <AreaChart data={rows} margin={{ top: 10, right: 14, bottom: 0, left: -14 }}>
          <defs>
            <linearGradient id="joinsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.28} />
              <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0.02} />
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
            tick={{ fontSize: 10.5, fill: MUTED }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<ChartTip labelFormatter={(l) => dayLabel(l)} />}
            cursor={{ stroke: 'var(--ds-line-strong)', strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            fill="url(#joinsFill)"
            dot={false}
            activeDot={{ r: 4.5, strokeWidth: 2, stroke: 'var(--ds-surface)' }}
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </figure>
  )
}

// People by team: horizontal bars, one validated hue per team (identity),
// values at the tips so nothing depends on hover.
export function TeamBars({ data }) {
  const rows = data.map((d) => ({ unit: d.unit, count: Number(d.count) }))
  const summary = rows.map((d) => `${d.unit} ${d.count}`).join(', ')
  return (
    <figure className="viz" role="group" aria-label={`People by team: ${summary}`}>
      <figcaption className="viz__title">People by team</figcaption>
      <ResponsiveContainer width="100%" height={Math.max(150, rows.length * 29)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 38, bottom: 0, left: 0 }} barCategoryGap={7}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="unit"
            width={86}
            tick={{ fontSize: 12, fill: MUTED }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<ChartTip />} cursor={{ fill: 'var(--secondary-soft)', opacity: 0.5 }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={16} animationDuration={700}>
            {rows.map((row, i) => (
              <Cell key={row.unit} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
            <LabelList dataKey="count" position="right" formatter={fmt} style={{ fill: INK, fontSize: 12, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  )
}

// How people are connected: one whole split into parts — a tall segmented bar
// (never a donut). Shares print inside segments wide enough to hold them; the
// legend names every part in block order, and hover/focus carries the rest.
export function ConnectionsSplit({ data, labels }) {
  const rows = data.map((d) => ({ key: d.type, label: labels[d.type] || d.type, count: Number(d.count) }))
  const total = rows.reduce((s, r) => s + r.count, 0) || 1
  const summary = rows.map((r) => `${r.label} ${Math.round((r.count / total) * 100)}%`).join(', ')
  return (
    <figure className="viz" role="group" aria-label={`How people are connected: ${summary}`}>
      <figcaption className="viz__title">How people are connected</figcaption>
      <div className="viz-split" role="img" aria-label={summary}>
        {rows.map((r, i) => {
          const share = (r.count / total) * 100
          return (
            <span
              key={r.key}
              className="viz-split__part"
              style={{ width: `${share}%`, background: CHART_COLORS[i % CHART_COLORS.length], animationDelay: `${i * 70}ms` }}
              tabIndex={0}
              title={`${r.label}: ${fmt(r.count)} (${Math.round(share)}%)`}
            >
              {share >= 9 && <em>{Math.round(share)}%</em>}
            </span>
          )
        })}
      </div>
      <ul className="viz-legend">
        {rows.map((r, i) => (
          <li key={r.key}>
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
