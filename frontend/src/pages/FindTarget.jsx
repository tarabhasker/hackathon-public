import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import ReachReport, { DeleteTarget } from '../components/target/ReachReport'
import { Badge, Button, Card, Eyebrow, Icon, Notice, Spinner, TextField } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { splitTargetQuery } from '../lib/target'

const RUNG_LABEL = { 1: 'Path found', 2: 'Into company', 3: 'Next to company', 4: 'Cold' }

function UpgradeCard() {
  return (
    <Card className="ft-upgrade">
      <span className="ft-upgrade__icon"><Icon name="target" size={26} /></span>
      <div>
        <h2>Find the Target is a Premium feature</h2>
        <p>
          Name a company and a role. We find the decision-maker on the public web, then show which
          colleagues can get you to them, and how strong each link really is.
        </p>
        <p className="ft-dim">Ask an admin to turn on Premium for your account.</p>
      </div>
    </Card>
  )
}

function CandidateCard({ candidate, onConfirm, busy }) {
  return (
    <Card className="ft-candidate">
      <div className="ft-candidate__head">
        <div>
          <span className="ft-candidate__name">{candidate.name}</span>
          <span className="ft-candidate__role">
            {candidate.title} · {candidate.company}
          </span>
        </div>
        <Badge tone={candidate.confidence === 'high' ? 'primary' : candidate.confidence === 'low' ? 'warn' : 'neutral'}>
          {candidate.confidence} confidence
        </Badge>
      </div>
      {candidate.employers.length > 0 && (
        <ul className="ft-career">
          {candidate.employers.map((e, i) => (
            <li key={`${e.org}-${i}`}>
              <strong>{e.org}</strong>
              {(e.start_year || e.end_year) && (
                <span className="ft-dim"> {e.start_year ?? '?'}–{e.end_year ?? 'now'}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {(candidate.schools.length > 0 || candidate.boards.length > 0) && (
        <p className="ft-dim ft-candidate__extra">
          {candidate.schools.length > 0 && <>Studied: {candidate.schools.join(', ')}. </>}
          {candidate.boards.length > 0 && <>Boards: {candidate.boards.join(', ')}.</>}
        </p>
      )}
      {candidate.sources.length > 0 && (
        <p className="ft-candidate__sources">
          Sources:{' '}
          {candidate.sources.map((s, i) => (
            <a key={s.url} href={s.url} target="_blank" rel="noreferrer noopener">
              {s.title}
              {i < candidate.sources.length - 1 ? ', ' : ''}
            </a>
          ))}
        </p>
      )}
      <Button variant="primary" onClick={onConfirm} disabled={busy}>
        {busy ? <Spinner size={14} /> : <Icon name="check" size={15} />}
        This is the right person
      </Button>
    </Card>
  )
}

export default function FindTarget() {
  const { user } = useAuth()
  const premium = user.plan === 'premium' || user.is_admin
  const [params] = useSearchParams()
  // One box: "VAT MY Managing Director" is split into role and company
  const [text, setText] = useState(() =>
    params.get('q') || [params.get('company'), params.get('role')].filter(Boolean).join(' '),
  )
  const { role, company } = splitTargetQuery(text)
  const [searchedFor, setSearchedFor] = useState('')
  const [lookup, setLookup] = useState(null)
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(null) // 'search' | candidate index | 'report'
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])

  const loadHistory = useCallback(() => {
    if (!premium) return
    api('/api/targets').then(setHistory).catch(() => {})
  }, [premium])

  useEffect(loadHistory, [loadHistory])

  async function search(e, refresh = false, query = { company, role, query: text.trim() }) {
    e?.preventDefault()
    setSearchedFor(query.query || `${query.company} ${query.role}`)
    setError(null)
    setReport(null)
    setLookup(null)
    setBusy('search')
    try {
      setLookup(await api('/api/target/search', { method: 'POST', body: { ...query, refresh } }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function confirm(index) {
    setError(null)
    setBusy(index)
    try {
      setReport(await api('/api/target/confirm', {
        method: 'POST',
        body: { lookup_id: lookup.lookup_id, candidate_index: index },
      }))
      setLookup(null)
      loadHistory()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function openPast(id) {
    setError(null)
    setLookup(null)
    setBusy('report')
    try {
      setReport(await api(`/api/target/${id}/reach`))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(null)
    }
  }

  // Arriving from the network search: ?id= opens that target's report
  const opened = useRef(false)
  useEffect(() => {
    const id = params.get('id')
    if (premium && id && !opened.current) {
      opened.current = true
      openPast(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [premium, params])

  // Removes the target (and, if nobody else looked them up, the person and the
  // saved searches that found them, so the next search goes to the web again)
  async function removeTarget(id) {
    setError(null)
    try {
      await api(`/api/target/${id}`, { method: 'DELETE' })
      setHistory((list) => list.filter((h) => h.id !== id))
      if (report?.target.id === id) setReport(null)
      setLookup(null)
    } catch (err) {
      setError(err.message)
    }
  }

  function refreshTarget() {
    const query = {
      company: report.target.company,
      role: report.target.title,
      query: `${report.target.company} ${report.target.title}`,
    }
    setText(query.query)
    search(null, true, query)
  }

  return (
    <div className="ft-page">
      <div className="ft">
        <header className="ft-head">
          <div>
            <h1>
              Find the Target <Badge tone="primary">★ Premium</Badge>
            </h1>
            <p className="ft-head__sub">
              Who in our network can get you to the decision-maker, and how strong is that tie?
            </p>
          </div>
        </header>

        {!premium ? (
          <UpgradeCard />
        ) : (
          <>
            <Card as="form" className="ft-form" onSubmit={search}>
              <TextField
                label="Who are you trying to reach?"
                placeholder="VAT MY Managing Director"
                value={text}
                onChange={(e) => setText(e.target.value)}
                hint={
                  text.trim()
                    ? role && company
                      ? `Role: ${role} · Company: ${company}`
                      : 'Add a role and a company, e.g. “Managing Director, Intel Malaysia”'
                    : 'A role and a company, in any order'
                }
                required
              />
              <Button type="submit" variant="primary" disabled={busy === 'search' || !company || !role}>
                {busy === 'search' ? <Spinner size={14} /> : <Icon name="search" size={15} />}
                {busy === 'search' ? 'Searching…' : 'Search the web'}
              </Button>
            </Card>

            {busy === 'search' && (
              <p className="ft-searching" role="status">
                <Spinner size={14} /> Searching Google for “{searchedFor}” and reading the results…
              </p>
            )}

            {error && <Notice>{error}</Notice>}

            {lookup && (
              <section className="ft-section">
                <Eyebrow>
                  {lookup.candidates.length === 0
                    ? 'No one found'
                    : lookup.candidates.length === 1
                      ? 'Is this who you mean?'
                      : 'Which person do you mean?'}
                </Eyebrow>
                {lookup.candidates.length === 0 && (
                  <p className="ft-dim">
                    The web search found nobody in that role. Try the company's full name or a broader
                    role (for example “Country Manager”).
                  </p>
                )}
                <p className="ft-dim ft-engine">
                  {lookup.cached
                    ? `Saved search from ${new Date(lookup.created_at).toLocaleDateString()}`
                    : `Searched ${lookup.engine || 'the web'}`}
                  {' · '}
                  {lookup.sources.length} result{lookup.sources.length === 1 ? '' : 's'} read
                </p>
                {lookup.candidates.map((c, i) => (
                  <CandidateCard key={`${c.name}-${i}`} candidate={c} busy={busy === i} onConfirm={() => confirm(i)} />
                ))}
                {lookup.cached && (
                  <p className="ft-dim">
                    <button type="button" className="ft-link" onClick={(e) => search(e, true)}>
                      Search the web again
                    </button>
                  </p>
                )}
              </section>
            )}

            {busy === 'report' && (
              <p className="ft-dim" role="status"><Spinner size={14} /> Working out your reach…</p>
            )}
            {report && (
              <ReachReport
                report={report}
                onRefresh={refreshTarget}
                onDelete={() => removeTarget(report.target.id)}
              />
            )}

            {history.length > 0 && (
              <section className="ft-section">
                <Eyebrow>Your targets</Eyebrow>
                <ul className="ft-history">
                  {history.map((h) => (
                    <li key={h.id}>
                      <button type="button" className="ft-history__open" onClick={() => openPast(h.id)}>
                        <span>
                          <strong>{h.name}</strong> · {h.title}, {h.company}
                        </span>
                        <Badge tone={h.best_rung === 1 ? 'primary' : h.best_rung === 4 ? 'warn' : 'neutral'}>
                          {RUNG_LABEL[h.best_rung] || '—'}
                        </Badge>
                      </button>
                      <DeleteTarget name={h.name} compact onDelete={() => removeTarget(h.id)} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
