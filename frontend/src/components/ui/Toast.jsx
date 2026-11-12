import { createContext, useCallback, useContext, useMemo, useState } from 'react'

// Snackbars, bottom-right. Use anywhere:
//   const toast = useToast()
//   toast.error('Wrong email or password')
//   toast.success('Profile filled from your CV')
const ToastContext = createContext(null)
let nextId = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    // play the exit animation, then actually remove
    setToasts((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), 240)
  }, [])

  const push = useCallback(
    (message, { tone = 'info', duration } = {}) => {
      const id = nextId++
      setToasts((all) => [...all.slice(-3), { id, message, tone }]) // keep at most 4
      const ms = duration ?? (tone === 'danger' ? 7000 : 4500)
      setTimeout(() => dismiss(id), ms)
      return id
    },
    [dismiss],
  )

  const value = useMemo(
    () => ({
      show: push,
      error: (m, o) => push(m, { ...o, tone: 'danger' }),
      success: (m, o) => push(m, { ...o, tone: 'ok' }),
      info: (m, o) => push(m, { ...o, tone: 'info' }),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast--${t.tone} ${t.leaving ? 'toast--leaving' : ''}`}
            role={t.tone === 'danger' ? 'alert' : 'status'}
          >
            <span className="toast__dot" aria-hidden="true" />
            <span className="toast__msg">{t.message}</span>
            <button
              type="button"
              className="toast__close"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
