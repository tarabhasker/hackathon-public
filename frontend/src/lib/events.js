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

// The room someone just joined via QR/code, so sign-in and first-time setup can
// land them in it instead of the main page. Cleared when the room page opens.
const ROOM_KEY = 'bff.joinedRoom'
const ROOM_MAX_AGE_MS = 60 * 60 * 1000

export function setJoinedRoom(id) {
  try {
    localStorage.setItem(ROOM_KEY, JSON.stringify({ id, at: Date.now() }))
  } catch {
    // storage unavailable: they'll land on the network page instead
  }
}

export function getJoinedRoom() {
  try {
    const value = JSON.parse(localStorage.getItem(ROOM_KEY))
    if (!value || Date.now() - value.at > ROOM_MAX_AGE_MS) return null
    return value.id
  } catch {
    return null
  }
}

export function clearJoinedRoom() {
  try {
    localStorage.removeItem(ROOM_KEY)
  } catch {
    // nothing to clear
  }
}
