import { useEffect, useState } from 'react'
import { api } from '../api'

// Debounced semantic search for "who can help with <query>".
// results: null while idle (empty query), else [{person, hops, why, ...}].
export function usePeopleSearch(query, meId, { limit = 5, delay = 350 } = {}) {
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults(null)
      setSearching(false)
      setError(null)
      return
    }
    let live = true
    setSearching(true)
    const timer = setTimeout(() => {
      api('/api/search', { method: 'POST', body: { query: q, requester_id: meId, limit } })
        .then((data) => {
          if (!live) return
          setResults(data.results)
          setError(null)
        })
        .catch((err) => live && setError(err.message))
        .finally(() => live && setSearching(false))
    }, delay)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [query, meId, limit, delay])

  return { results, searching, error }
}
