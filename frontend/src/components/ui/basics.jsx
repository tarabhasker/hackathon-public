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

// Animated loading spinner; inherits text colour.
export function Spinner({ size = 16, className = '' }) {
  return (
    <svg
      className={`ui-spinner ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Loading"
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

// Inline status message. tone: 'danger' | 'ok' | 'warn'
export function Notice({ tone = 'danger', children }) {
  return (
    <p className={`ui-notice ui-notice--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {children}
    </p>
  )
}
