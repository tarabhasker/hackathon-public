import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE } from '../api'

const EDGE_LABELS = {
  project: 'worked on a project together',
  employer: 'overlapped at an employer',
  school: 'studied together',
  declared: 'declared connection',
  semantic: 'similar expertise',
}

function PathChain({ requesterName, path }) {
  if (path.length === 0) {
    return <span className="path-cold">no warm path — cold outreach</span>
  }
  return (
    <span className="path-chain">
      <span className="path-node you">You</span>
      {path.map((hop) => (
        <span key={hop.id}>
          <span className="path-arrow" title={hop.edge.evidence || EDGE_LABELS[hop.edge.type]}>
            →
          </span>
          <span className="path-node" title={hop.edge.evidence}>
            {hop.name}
          </span>
        </span>
      ))}
    </span>
  )
}

function ResultCard({ result, rank }) {
  const p = result.person
  return (
    <div className="result-card" style={{ animationDelay: `${rank * 90}ms` }}>
      <div className="result-top">
        <div className="result-rank">#{rank + 1}</div>
        <div className="result-who">
          <div className="result-name">
            {p.name} {p.is_real && <span className="badge-real">real</span>}
          </div>
          <div className="result-title">
            {p.title}
            {p.org_unit ? ` · ${p.org_unit}` : ''}
          </div>
        </div>
        <div className="result-score" title="relevance × path strength × willingness">
          {Math.round(result.score * 1000) / 10}
        </div>
      </div>
      <div className="result-why">{result.why}</div>
      <div className="result-path">
        <PathChain path={result.path} />
        {result.path.length > 0 && (
          <span className="path-meta">
            {result.hops} hop{result.hops === 1 ? '' : 's'} · strength {result.path_strength}
          </span>
        )}
      </div>
      <div className="result-snippet">{result.snippet}…</div>
    </div>
  )
}

export default function Search() {
  const [people, setPeople] = useState([])
  const [me, setMe] = useState('')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/people`)
      .then((res) => res.json())
      .then((list) => {
        setPeople(list)
        if (list.length > 0) setMe(String(list[0].id))
      })
      .catch(() => setError('Backend not reachable — is ./run-backend.sh running?'))
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (!query.trim() || !me) return
    setSearching(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, requester_id: Number(me), limit: 5 }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Search failed')
      }
      const data = await res.json()
      setResults(data.results)
    } catch (err) {
      setError(err.message)
    } finally {
      setSearching(false)
    }
  }

  return (
    <section className="demo-section page-top">
      <div className="container" style={{ maxWidth: 760 }}>
        <div className="demo-card">
          <h2>Who can help you?</h2>
          <p className="hint">
            Describe what you need; get the right people and the warmest path to them.
          </p>

          <form onSubmit={submit} className="quiz-form">
            <label>
              <span>You are</span>
              <select value={me} onChange={(e) => setMe(e.target.value)} disabled={searching}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.is_real ? '★ ' : ''}{p.name} — {p.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>What do you need?</span>
              <input
                type="text"
                placeholder="e.g. someone who knows Terraform and GCP for infrastructure"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                required
                autoComplete="off"
                disabled={searching}
              />
            </label>

            {error && <p className="quiz-error">{error}</p>}

            <button className="btn btn-gradient btn-submit" type="submit" disabled={searching}>
              {searching ? 'Searching the network…' : 'Find my path'}
            </button>
          </form>
        </div>

        {results !== null && (
          <div className="results">
            {results.length === 0 ? (
              <div className="demo-card" style={{ marginTop: '1.5rem' }}>
                <p className="hint" style={{ margin: 0 }}>
                  Nobody matched that ask. Try different words, or{' '}
                  <Link to="/add">add more people to the network</Link>.
                </p>
              </div>
            ) : (
              results.map((r, i) => <ResultCard key={r.person.id} result={r} rank={i} />)
            )}
          </div>
        )}
      </div>
    </section>
  )
}
