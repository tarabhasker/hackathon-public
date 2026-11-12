import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout from '../components/layout/AuthLayout'
import { Button, Notice, TextField } from '../components/ui'
import { useAuth } from '../hooks/useAuth'

// Shared email + password form behind the Sign in and Register pages.
// The route guards redirect onward (to setup or the app) once `user` is set.
function AuthForm({ mode }) {
  const isRegister = mode === 'register'
  const { signIn, register } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await (isRegister ? register : signIn)(email, password)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title={isRegister ? 'Create your account' : 'Welcome back'}
      subtitle={
        isRegister
          ? 'Join the network to find who can help, and the warmest path to them.'
          : 'Sign in to see your network.'
      }
      footer={
        isRegister ? (
          <>Already have an account? <Link to="/signin">Sign in</Link></>
        ) : (
          <>New here? <Link to="/register">Create an account</Link></>
        )
      }
    >
      <form className="form" onSubmit={submit}>
        <TextField
          label="Work email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          disabled={busy}
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          minLength={isRegister ? 8 : undefined}
          hint={isRegister ? 'At least 8 characters.' : undefined}
          required
          disabled={busy}
        />
        {error && <Notice>{error}</Notice>}
        <Button type="submit" variant="primary" size="lg" block disabled={busy}>
          {busy ? 'One moment…' : isRegister ? 'Create account' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  )
}

export const SignIn = () => <AuthForm mode="signin" />
export const Register = () => <AuthForm mode="register" />
