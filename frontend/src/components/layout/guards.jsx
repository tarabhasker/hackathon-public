import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

// Route guards for the onboarding funnel:
//   signed out            -> /signin
//   signed in, no profile -> /setup
//   signed in + profile   -> the app
function Splash() {
  return <div className="splash" role="status">Loading…</div>
}

export function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) return <Splash />
  return user ? <Outlet /> : <Navigate to="/signin" replace />
}

export function RequireProfile() {
  const { user } = useAuth()
  return user.person ? <Outlet /> : <Navigate to="/setup" replace />
}

export function RequireAdmin() {
  const { user } = useAuth()
  return user.is_admin ? <Outlet /> : <Navigate to="/" replace />
}

export function GuestOnly() {
  const { user, loading } = useAuth()
  if (loading) return <Splash />
  if (!user) return <Outlet />
  // admins without a profile land on the admin page, not the setup funnel
  if (!user.person && user.is_admin) return <Navigate to="/admin" replace />
  return <Navigate to={user.person ? '/' : '/setup'} replace />
}
