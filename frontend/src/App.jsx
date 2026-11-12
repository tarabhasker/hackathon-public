import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import { GuestOnly, RequireAdmin, RequireAuth, RequireProfile } from './components/layout/guards'
import PendingEventJoiner from './components/events/PendingEventJoiner'
import { ToastProvider } from './components/ui'
import { AuthProvider } from './hooks/useAuth'
import Admin from './pages/Admin'
import AdminEvent from './pages/AdminEvent'
import { Register, SignIn } from './pages/AuthForm'
import JoinEvent from './pages/JoinEvent'
import Network from './pages/Network'
import Quiz from './pages/Quiz'
import Rooms from './pages/Rooms'
import Setup from './pages/Setup'

// Flow: register / sign in -> first-time setup -> main UI (network).
export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
      <AuthProvider>
        <PendingEventJoiner />
        <Routes>
          <Route path="/join/:code" element={<JoinEvent />} />
          <Route element={<GuestOnly />}>
            <Route path="/signin" element={<SignIn />} />
            <Route path="/register" element={<Register />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/setup" element={<Setup />} />
            {/* Admin skips RequireProfile: an admin account needs no person profile */}
            <Route element={<RequireAdmin />}>
              <Route element={<AppShell />}>
                <Route path="/admin" element={<Admin />} />
                <Route path="/admin/rooms" element={<Rooms />} />
                <Route path="/admin/events/:id" element={<AdminEvent />} />
              </Route>
            </Route>
            <Route element={<RequireProfile />}>
              <Route element={<AppShell />}>
                <Route index element={<Network />} />
                <Route path="/quiz" element={<Quiz />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
