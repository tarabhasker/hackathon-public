import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, getToken, setToken } from '../api'

const AuthContext = createContext(null)

// Holds the signed-in account. `user.person` is null until first-time setup.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(() => Boolean(getToken()))

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null)
      return null
    }
    try {
      const me = await api('/api/auth/me')
      setUser(me)
      return me
    } catch (err) {
      if (err.status === 401) {
        setToken(null)
        setUser(null)
      }
      return null
    }
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const value = useMemo(() => {
    async function authenticate(path, email, password) {
      const data = await api(path, { method: 'POST', body: { email, password } })
      setToken(data.token)
      setUser(data.user)
      return data.user
    }
    return {
      user,
      loading,
      refresh,
      signIn: (email, password) => authenticate('/api/auth/login', email, password),
      register: (email, password) => authenticate('/api/auth/register', email, password),
      signOut: () => {
        setToken(null)
        setUser(null)
      },
    }
  }, [user, loading, refresh])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
