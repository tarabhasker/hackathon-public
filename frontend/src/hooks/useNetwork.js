import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { evidenceIndex, pathTo } from '../lib/network'

const EMPTY = { nodes: [], edges: [] }

// The signed-in person's neighbourhood graph plus the current selection.
export function useNetwork(meId) {
  const [net, setNet] = useState(null)
  const [selected, setSelected] = useState(null) // person-like {id, name, title, org_unit}
  const [error, setError] = useState(null)
  const netRef = useRef(null)
  useEffect(() => {
    netRef.current = net
  }, [net])

  const load = useCallback(
    (focusId) =>
      api(`/api/network?requester_id=${meId}${focusId ? `&focus_id=${focusId}` : ''}`),
    [meId],
  )

  useEffect(() => {
    let live = true
    setNet(null)
    setSelected(null)
    setError(null)
    load()
      .then((data) => {
        if (!live) return
        setNet(data)
        // Open on the strongest 2-hop person: that's where an intro helps most
        const start = data.nodes.find((n) => n.depth === 2) || data.nodes.find((n) => n.depth === 1)
        setSelected(start || null)
      })
      .catch((err) => live && setError(err.message))
    return () => {
      live = false
    }
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

  return { ...model, loading: net === null && !error, error, select }
}
