import { NavLink, Outlet } from 'react-router-dom'
import { API_BASE } from '../../api'
import { useAuth } from '../../hooks/useAuth'
import { Avatar, Icon } from '../ui'

// Single source of truth for navigation: used by the sidebar and the mobile tab bar.
const NAV = [
  { to: '/', label: 'Network', mobileLabel: 'Find', icon: 'network', mobileIcon: 'search', end: true },
  { to: '/quiz', label: 'Quiz', icon: 'spark' },
]

function Brand() {
  return (
    <div className="brand">
      <span className="brand__mark"><Icon name="network" size={16} strokeWidth={2} /></span>
      <span className="brand__name">BFF</span>
    </div>
  )
}

function Sidebar() {
  const { user, signOut } = useAuth()
  return (
    <nav className="shell-nav" aria-label="Main">
      <Brand />
      {NAV.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className="shell-nav__link">
          <Icon name={item.icon} />
          {item.label}
        </NavLink>
      ))}
      <a className="shell-nav__link" href={`${API_BASE}/docs`}>
        <Icon name="users" />
        API docs
      </a>
      <div className="shell-nav__spacer" />
      <div className="shell-nav__me">
        <Avatar name={user.person?.name || user.email} size={32} tone="secondary" />
        <span className="shell-nav__metext">
          <span className="shell-nav__mename">{user.person?.name || 'You'}</span>
          <span className="shell-nav__meemail">{user.email}</span>
        </span>
      </div>
      <button type="button" className="shell-nav__link" onClick={signOut}>
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
