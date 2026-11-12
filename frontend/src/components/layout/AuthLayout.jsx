import { Card } from '../ui'
import { Brand } from './AppShell'

// Centred card used by sign-in, register and first-time setup.
export default function AuthLayout({ title, subtitle, wide = false, footer, children }) {
  return (
    <div className="auth">
      <div className={`auth__inner ${wide ? 'auth__inner--wide' : ''}`}>
        <Brand />
        <Card className="auth__card">
          <div className="auth__head">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {children}
        </Card>
        {footer && <p className="auth__footer">{footer}</p>}
      </div>
    </div>
  )
}
