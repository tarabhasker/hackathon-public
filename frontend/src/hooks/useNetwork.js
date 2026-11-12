import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { evidenceIndex, pathTo } from '../lib/network'

const EMPTY = { nodes: [], edges: [] }

// The signed-in person's neighbourhood graph plus the current selection.
// Whose network it is comes from the auth token, not a parameter.
export const DEFAULT_DEGREES = 3
export const MAX_DEGREES = 6
const POLL_MS = 15000 // quiet background refresh, so new connections appear on their own

export function useNetwork() {
  const [net, setNet] = useState(null)
  const [selected, setSelected] = useState(null) // person-like {id, name, title, org_unit}
  const [error, setError] = useState(null)
  const [degrees, setDegrees] = useState(DEFAULT_DEGREES) // how far out the view reaches (1..6)
  const netRef = useRef(null)
  useEffect(() => {
    netRef.current = net
  }, [net])
  const selectedRef = useRef(null)
  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  const load = useCallback(
    (focusId) => api(`/api/network?degrees=${degrees}${focusId ? `&focus_id=${focusId}` : ''}`),
    [degrees],
  )

  useEffect(() => {
    let live = true
    setError(null)
    load()
      .then((data) => {
        if (!live) return
        setNet(data)
        // Keep the current selection when just widening/narrowing the view;
        // otherwise open on the strongest 2-hop person — where an intro helps most
        setSelected((prev) => {
          if (prev && data.nodes.some((n) => n.id === prev.id)) return prev
          return data.nodes.find((n) => n.depth === 2) || data.nodes.find((n) => n.depth === 1) || null
        })
      })
      .catch((err) => live && setError(err.message))
    return () => {
      live = false
    }
  }, [load])

  // Re-pull the graph right now (e.g. just after connecting with someone).
  const refresh = useCallback(() => {
    load(selectedRef.current?.id)
      .then(setNet)
      .catch(() => {})
  }, [load])

  // Background refresh: new connections (yours or anyone's) appear without a
  // reload. Keeps the focused person's path by passing their id along, and
  // keeps the current graph on a transient failure.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return
      load(selectedRef.current?.id)
        .then(setNet)
        .catch(() => {})
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  // Select someone; if they're outside the drawn graph, refetch with their path included.
  const select = useCallback(
    async (person) => {
      setSelected(person)
      const current = netRef.current
      if (current && !current.nodes.some((n) => n.id === person.id)) {
        try {
          setNet(await load(person.id))
        } catch (err) {
          setError(err.message)
        }
      }
    },
    [load],
  )

  const model = useMemo(() => {
    const { nodes, edges } = net || EMPTY
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
    const target = selected ? byId[selected.id] || selected : null
    const path = target ? pathTo(byId, target.id) : []
    return { nodes, edges, byId, target, path, evidence: evidenceIndex(edges) }
  }, [net, selected])

  return { ...model, loading: net === null && !error, error, select, refresh, degrees, setDegrees }
}
