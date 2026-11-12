import { Card, Icon } from '../ui'
import { Brand } from './AppShell'
import SocialBackdrop from './SocialBackdrop'

const POINTS = [
  { icon: 'search', text: 'Search by what you need, not who you know' },
  { icon: 'network', text: 'See the strongest path to them, hop by hop' },
  { icon: 'users', text: 'Ask a mutual colleague for a warm intro' },
]

// Split-screen frame for sign-in, register and first-time setup:
// an animated hero panel on the left, the form card on the right.
export default function AuthLayout({ title, subtitle, wide = false, footer, children }) {
  return (
    <div className="auth">
      <aside className="auth-hero">
        <SocialBackdrop className="auth-hero__canvas" />
        <div className="auth-hero__shade" aria-hidden="true" />
        <Brand inverse />
        <div className="auth-hero__copy">
          <p className="auth-hero__headline">
            Someone you know <em>knows the answer.</em>
          </p>
          <p className="auth-hero__lead">
            Describe the help you need. BFF finds the right person in your organisation
            and the warmest path of introductions to reach them.
          </p>
          <ul className="auth-hero__points">
            {POINTS.map((point) => (
              <li key={point.text}>
                <span><Icon name={point.icon} size={16} /></span>
                {point.text}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="auth-main">
        <div className={`auth__inner ${wide ? 'auth__inner--wide' : ''}`}>
          <Card className="auth__card">
            <div className="auth__head">
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
            {children}
          </Card>
          {footer && <p className="auth__footer">{footer}</p>}
        </div>
      </main>
    </div>
  )
}
