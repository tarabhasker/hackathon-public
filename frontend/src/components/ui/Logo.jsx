import { useId } from 'react'

// BFF brand lockup: two overlapping circles (two people, one shared connection)
// next to a serif wordmark. `inverse` is for dark backgrounds.
export default function Logo({ size = 30, inverse = false, className = '' }) {
  const clipId = useId()
  return (
    <span className={`logo ${inverse ? 'logo--inverse' : ''} ${className}`}>
      <svg
        className="logo__mark"
        width={size * 1.45}
        height={size}
        viewBox="0 0 58 40"
        aria-hidden="true"
      >
        <defs>
          <clipPath id={clipId}>
            <circle cx="20" cy="20" r="18" />
          </clipPath>
        </defs>
        <circle className="logo__left" cx="20" cy="20" r="18" />
        <circle className="logo__right" cx="38" cy="20" r="18" />
        <circle className="logo__overlap" cx="38" cy="20" r="18" clipPath={`url(#${clipId})`} />
      </svg>
      <span className="logo__word" style={{ fontSize: Math.round(size * 0.78) }}>BFF</span>
    </span>
  )
}
