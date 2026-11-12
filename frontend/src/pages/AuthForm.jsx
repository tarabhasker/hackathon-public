import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout from '../components/layout/AuthLayout'
import { Button, Notice, TextField } from '../components/ui'
import { useAuth } from '../hooks/useAuth'

function EyeIcon({ open }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <line x1="4" y1="20" x2="20" y2="4" />}
    </svg>
  )
}

// 0 none, 1 weak, 2 okay, 3 strong — deliberately simple, it's a nudge not a gate
function strengthOf(password) {
  if (!password) return 0
  let score = 1
  if (password.length >= 8) score++
  if (password.length >= 12 && /[^a-zA-Z]/.test(password)) score++
  return score
}

const STRENGTH_LABEL = ['', 'Too short', 'Okay', 'Strong']

// Shared email + password form behind the Sign in and Register pages.
// The route guards redirect onward (to setup or the app) once `user` is set.
function AuthForm({ mode }) {
  const isRegister = mode === 'register'
  const { signIn, register } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const strength = strengthOf(password)

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
          autoFocus
          required
          disabled={busy}
        />
        <TextField
          label="Password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          minLength={isRegister ? 8 : undefined}
          hint={isRegister && !password ? 'At least 8 characters.' : undefined}
          required
          disabled={busy}
          trailing={
            <button
              type="button"
              className="ui-pwtoggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              <EyeIcon open={showPassword} />
            </button>
          }
        />
        {isRegister && password && (
          <div className="pw-meter" aria-live="polite">
            <div className="pw-meter__bars" data-level={strength}>
              <i /><i /><i />
            </div>
            <span className="pw-meter__label">{STRENGTH_LABEL[strength]}</span>
          </div>
        )}
        {error && <Notice>{error}</Notice>}
        <Button type="submit" variant="primary" size="lg" block disabled={busy}>
          {busy ? (
            <span className="btn-busy"><i className="spinner" aria-hidden="true" />
              {isRegister ? 'Creating your account…' : 'Signing you in…'}
            </span>
          ) : isRegister ? 'Create account' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  )
}

export const SignIn = () => <AuthForm mode="signin" />
export const Register = () => <AuthForm mode="register" />
