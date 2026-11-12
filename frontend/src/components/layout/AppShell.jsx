import { NavLink, Outlet } from 'react-router-dom'
import { API_BASE, assetUrl } from '../../api'
import { useAuth } from '../../hooks/useAuth'
import { Avatar, Icon, Logo } from '../ui'

// Single source of truth for navigation: used by the sidebar and the mobile tab bar.
const NAV = [
  { to: '/', label: 'Network', mobileLabel: 'Find', icon: 'network', mobileIcon: 'search', end: true },
  { to: '/profile', label: 'Profile', icon: 'user' },
  { to: '/quiz', label: 'Quiz', icon: 'spark' },
]

function Brand({ inverse = false }) {
  return <Logo inverse={inverse} size={inverse ? 40 : 30} className="brand" />
}

function Sidebar() {
  const { user, signOut } = useAuth()
  return (
    <nav className="shell-nav" aria-label="Main">
      <Brand />
      {NAV.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className="shell-nav__link" title={item.label}>
          <Icon name={item.icon} />
          {item.label}
        </NavLink>
      ))}
      <a className="shell-nav__link" href={`${API_BASE}/docs`} title="API docs">
        <Icon name="users" />
        API docs
      </a>
      <div className="shell-nav__spacer" />
      <NavLink to="/profile" className="shell-nav__me" title="Your profile">
        <Avatar name={user.person?.name || user.email} src={assetUrl(user.person?.avatar_url)} size={32} tone="secondary" />
        <span className="shell-nav__metext">
          <span className="shell-nav__mename">{user.person?.name || 'You'}</span>
          <span className="shell-nav__meemail">{user.email}</span>
        </span>
      </NavLink>
      <button type="button" className="shell-nav__link" onClick={signOut} title="Sign out">
        <Icon name="logout" />
        Sign out
      </button>
    </nav>
  )
}

function MobileNav() {
  const { signOut } = useAuth()
  return (
    <nav className="shell-tabs" aria-label="Main">
      {NAV.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className="shell-tabs__link">
          <Icon name={item.mobileIcon || item.icon} size={20} />
          {item.mobileLabel || item.label}
        </NavLink>
      ))}
      <button type="button" className="shell-tabs__link" onClick={signOut}>
        <Icon name="logout" size={20} />
        Sign out
      </button>
    </nav>
  )
}

// Signed-in frame: sidebar on desktop, bottom tab bar on phones.
export default function AppShell() {
  return (
    <div className="shell">
      <Sidebar />
      <div className="shell-content">
        <Outlet />
      </div>
      <MobileNav />
    </div>
  )
}

export { Brand }
