import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { assetUrl } from '../../api'
import { useAuth } from '../../hooks/useAuth'
import { Avatar, Icon, Logo } from '../ui'

// Single source of truth for navigation: used by the sidebar and the mobile tab bar.
// Admins see only their hosting tools; members see the network app.
const MEMBER_NAV = [
  { to: '/', label: 'Network', mobileLabel: 'Find', icon: 'network', mobileIcon: 'search', end: true },
  { to: '/target', label: 'Find the Target', mobileLabel: 'Target', icon: 'target', premium: true },
  { to: '/calendar', label: 'Calendar', icon: 'calendar' },
  { to: '/profile', label: 'Profile', icon: 'user' },
]
const ADMIN_NAV = [
  { to: '/admin', label: 'Home', icon: 'home', end: true },
  { to: '/admin/rooms', label: 'Rooms', icon: 'calendar' },
]

const SIDEBAR_KEY = 'bff.sidebar'

function Brand({ inverse = false }) {
  return <Logo inverse={inverse} size={inverse ? 40 : 30} className="brand" />
}

// The signed-in identity block: a link to the member's profile, a plain box for admins.
function Me({ isAdmin, children, ...props }) {
  if (isAdmin) return <div {...props}>{children}</div>
  return <NavLink to="/profile" {...props}>{children}</NavLink>
}

// Collapsed state survives reloads; Ctrl/Cmd+B toggles it (unless you're typing in a field).
function useSidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'collapsed'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'open')
    } catch {
      // storage unavailable: the choice just won't persist
    }
  }, [collapsed])

  useEffect(() => {
    function onKey(e) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'b') return
      const t = e.target
      if (t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
      e.preventDefault()
      setCollapsed((c) => !c)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return [collapsed, setCollapsed]
}

function Sidebar({ collapsed, onToggle }) {
  const { user, signOut } = useAuth()
  const nav = user.is_admin ? ADMIN_NAV : MEMBER_NAV
  // In the collapsed rail the text is hidden, so give every control a tooltip
  const tip = (label) => (collapsed ? { title: label } : {})

  return (
    <nav className="shell-nav" aria-label="Main">
      <div className="shell-nav__head">
        <Brand />
        <button
          type="button"
          className="shell-nav__toggle"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (Ctrl/⌘ + B)`}
        >
          <Icon name="sidebar" />
        </button>
      </div>

      {nav.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className="shell-nav__link" {...tip(item.label)}>
          <Icon name={item.icon} />
          <span className="shell-nav__label">
            {item.label}
            {item.premium && <span className="shell-nav__premium" aria-label="Premium"> ★</span>}
          </span>
        </NavLink>
      ))}
      <div className="shell-nav__spacer" />
      {/* Members' me-block links to their profile; admins have no person profile */}
      <Me className="shell-nav__me" isAdmin={user.is_admin} {...tip(user.person?.name || user.email)}>
        <Avatar
          name={user.person?.name || user.email}
          src={assetUrl(user.person?.avatar_url)}
          size={32}
          tone="secondary"
        />
        <span className="shell-nav__metext">
          <span className="shell-nav__mename">{user.person?.name || 'You'}</span>
          <span className="shell-nav__meemail">{user.email}</span>
        </span>
      </Me>
      <button type="button" className="shell-nav__link" onClick={signOut} {...tip('Sign out')}>
        <Icon name="logout" />
        <span className="shell-nav__label">Sign out</span>
      </button>
    </nav>
  )
}

function MobileNav() {
  const { user, signOut } = useAuth()
  const nav = user.is_admin ? ADMIN_NAV : MEMBER_NAV
  return (
    <nav className="shell-tabs" aria-label="Main">
      {nav.map((item) => (
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

// Signed-in frame: collapsible sidebar on desktop, bottom tab bar on phones.
export default function AppShell() {
  const [collapsed, setCollapsed] = useSidebar()
  return (
    <div className={`shell ${collapsed ? 'shell--collapsed' : ''}`}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="shell-content">
        <Outlet />
      </div>
      <MobileNav />
    </div>
  )
}

export { Brand }
