// In dev the backend runs separately (./run-backend.sh); in production
// the backend serves this app itself, so relative URLs hit the same origin
export const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:5001' : ''

// Absolute URL for a backend-served asset path such as a person's `avatar_url`.
export const assetUrl = (path) => (path ? `${API_BASE}${path}` : undefined)

const TOKEN_KEY = 'bff.token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage unavailable (private mode): the session just won't persist
  }
}

// JSON request helper. `body` may be a plain object (sent as JSON) or FormData.
// Throws an Error carrying the API's `detail` message and `status`.
export async function api(path, { method = 'GET', body } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const isForm = body instanceof FormData
  if (body && !isForm) headers['Content-Type'] = 'application/json'

  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    })
  } catch {
    throw new Error('Backend not reachable — is ./run-backend.sh running?')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error((data && typeof data.detail === 'string' && data.detail) || 'Request failed')
    err.status = res.status
    throw err
  }
  return data
}
