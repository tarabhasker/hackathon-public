import { Link } from 'react-router-dom'

// variant: 'primary' | 'secondary' | 'outline' | 'ghost'
// size:    'sm' | 'md' | 'lg'
// Renders a router <Link> when `to` is given, an <a> for `href`, else a <button>.
export default function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  iconOnly = false,
  to,
  href,
  className = '',
  children,
  ...rest
}) {
  const cls = [
    'ui-btn',
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    block && 'ui-btn--block',
    iconOnly && 'ui-btn--icon',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (to) return <Link to={to} className={cls} {...rest}>{children}</Link>
  if (href) return <a href={href} className={cls} {...rest}>{children}</a>
  return <button type="button" className={cls} {...rest}>{children}</button>
}
