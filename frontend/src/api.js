// In dev the backend runs separately (./run-backend.sh); in production
// the backend serves this app itself, so relative URLs hit the same origin
export const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:5001' : ''
