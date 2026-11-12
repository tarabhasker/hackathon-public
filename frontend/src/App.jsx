import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
import { GuestOnly, RequireAuth, RequireProfile } from './components/layout/guards'
import { ToastProvider } from './components/ui'
import { AuthProvider } from './hooks/useAuth'
import { Register, SignIn } from './pages/AuthForm'
import Network from './pages/Network'
import Profile from './pages/Profile'
import Quiz from './pages/Quiz'
import Setup from './pages/Setup'

// Flow: register / sign in -> first-time setup -> main UI (network).
export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route path="/signin" element={<SignIn />} />
            <Route path="/register" element={<Register />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/setup" element={<Setup />} />
            <Route element={<RequireProfile />}>
              <Route element={<AppShell />}>
                <Route index element={<Network />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/people/:id" element={<Profile />} />
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
