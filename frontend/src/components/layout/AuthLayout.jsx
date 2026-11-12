import { Card, Icon } from '../ui'
import { Brand } from './AppShell'
import SocialBackdrop from './SocialBackdrop'

const POINTS = [
  { icon: 'search', text: 'Search by what you need, not who you know' },
  { icon: 'network', text: 'See the strongest path to them, hop by hop' },
  { icon: 'users', text: 'Ask a mutual colleague for a warm intro' },
]

// Frame for sign-in, register and first-time setup: an animated background
// across the whole page that fades out to the right, the pitch in the left
// half and the form card centred in the right half.
export default function AuthLayout({ title, subtitle, wide = false, footer, children }) {
  return (
    <div className="auth" data-backdrop-host>
      <div className="auth-bg" aria-hidden="true">
        <SocialBackdrop className="auth-bg__canvas" />
      </div>

      <aside className="auth-hero">
        <div className="auth-hero__brand" data-backdrop-avoid>
          <Brand inverse />
        </div>
        <div className="auth-hero__copy" data-backdrop-avoid>
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
        <div className={`auth__inner ${wide ? 'auth__inner--wide' : ''}`} data-backdrop-avoid>
          <Card className="auth__card">
            <div className="auth__head">
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
            {children}
            {footer && <p className="auth__footer">{footer}</p>}
          </Card>
        </div>
      </main>
    </div>
  )
}
