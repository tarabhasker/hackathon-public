// An event someone scanned a QR for but hasn't joined yet (they still have to
// sign in or register). Remembered for a day so a detour through setup doesn't lose it.
const KEY = 'bff.pendingEvent'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export function getPendingEvent() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY))
    if (!value || Date.now() - value.at > MAX_AGE_MS) return null
    return value
  } catch {
    return null
  }
}

export function setPendingEvent({ code, name }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, name, at: Date.now() }))
  } catch {
    // storage unavailable (private mode): they'd need to rescan after signing in
  }
}

export function clearPendingEvent() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing to clear
  }
}

// Where the QR points. `base` is the site's public address, without a trailing slash.
export function joinUrl(base, code) {
  return `${base.replace(/\/+$/, '')}/join/${code}`
}
