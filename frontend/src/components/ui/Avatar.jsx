import { initials } from '../../lib/network'

// tone: 'primary' | 'primary-soft' | 'secondary' | 'neutral'
// Pass `src` to show a photo (falls back to initials without one), `label` to
// override the initials (e.g. "YOU"), `ring` for the outlined look.
export default function Avatar({ name, src, label, size = 32, tone = 'neutral', ring = false, className = '', style }) {
  return (
    <span
      className={`ui-avatar ui-avatar--${tone} ${ring ? 'ui-avatar--ring' : ''} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.3)), ...style }}
      aria-hidden="true"
    >
      {src ? <img className="ui-avatar__img" src={src} alt="" draggable="false" /> : label || initials(name)}
    </span>
  )
}
