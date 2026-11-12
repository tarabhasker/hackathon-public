import { useId } from 'react'

// Circle centres for the mark: one on top, two below, overlapping like a
// three-way Venn diagram (three people, and the connection they share).
const R = 11.5
const A = { cx: 22, cy: 13 } // top
const B = { cx: 15.2, cy: 24.6 } // bottom left
const C = { cx: 28.8, cy: 24.6 } // bottom right

// BFF brand lockup: the three-circle Venn mark next to a serif wordmark.
// Each circle and each overlap has its own class, coloured from the theme in
// layout.css. `inverse` is for dark backgrounds.
export default function Logo({ size = 30, inverse = false, className = '' }) {
  const id = useId().replace(/:/g, '')
  const clip = (name) => `url(#${id}-${name})`
  return (
    <span className={`logo ${inverse ? 'logo--inverse' : ''} ${className}`}>
      <svg className="logo__mark" width={size * 1.1} height={size} viewBox="2.5 0.5 39 37" aria-hidden="true">
        <defs>
          <clipPath id={`${id}-a`}>
            <circle cx={A.cx} cy={A.cy} r={R} />
          </clipPath>
          <clipPath id={`${id}-b`}>
            <circle cx={B.cx} cy={B.cy} r={R} />
          </clipPath>
        </defs>
        {/* the three people */}
        <circle className="logo__a" cx={A.cx} cy={A.cy} r={R} />
        <circle className="logo__b" cx={B.cx} cy={B.cy} r={R} />
        <circle className="logo__c" cx={C.cx} cy={C.cy} r={R} />
        {/* where two overlap */}
        <circle className="logo__ab" cx={B.cx} cy={B.cy} r={R} clipPath={clip('a')} />
        <circle className="logo__ac" cx={C.cx} cy={C.cy} r={R} clipPath={clip('a')} />
        <circle className="logo__bc" cx={C.cx} cy={C.cy} r={R} clipPath={clip('b')} />
        {/* where all three meet */}
        <g clipPath={clip('a')}>
          <circle className="logo__abc" cx={C.cx} cy={C.cy} r={R} clipPath={clip('b')} />
        </g>
      </svg>
      <span className="logo__word" style={{ fontSize: Math.round(size * 0.78) }}>BFF</span>
    </span>
  )
}
