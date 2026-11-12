// Small presentational building blocks.

// Surface container. tone: 'surface' (white) | 'tinted' (page-coloured)
export function Card({ tone = 'surface', as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag className={`ui-card ui-card--${tone} ${className}`} {...rest}>
      {children}
    </Tag>
  )
}

// Toggle pill, e.g. filters and multi-select options.
export function Chip({ selected = false, className = '', children, ...rest }) {
  return (
    <button
      type="button"
      className={`ui-chip ${selected ? 'ui-chip--selected' : ''} ${className}`}
      aria-pressed={selected}
      {...rest}
    >
      {children}
    </button>
  )
}

// Small outlined label, e.g. "2nd".
export function Badge({ tone = 'neutral', children }) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>
}

// Uppercase section label.
export function Eyebrow({ as: Tag = 'h2', className = '', children }) {
  return <Tag className={`ui-eyebrow ${className}`}>{children}</Tag>
}

// Inline status message. tone: 'danger' | 'ok' | 'warn'
export function Notice({ tone = 'danger', children }) {
  return (
    <p className={`ui-notice ui-notice--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {children}
    </p>
  )
}
