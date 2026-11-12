import { useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE } from '../api'

export default function AddProfile() {
  const [phase, setPhase] = useState('upload') // upload | parsing | confirm | saving | done
  const [parsed, setParsed] = useState(null)
  const [saved, setSaved] = useState(null)
  const [error, setError] = useState(null)

  async function onFile(event) {
    const file = event.target.files[0]
    if (!file) return
    setError(null)
    setPhase('parsing')
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch(`${API_BASE}/api/intake/cv`, { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Upload failed')
      }
      const data = await res.json()
      setParsed({
        name: data.name || '',
        title: data.title || '',
        org_unit: data.org_unit || '',
        skills: (data.skills || []).join(', '),
        employers: data.employers || [],
        projects: (data.projects || []).join(', '),
        ask: data.ask || '',
        offer: data.offer || '',
        summary: data.summary || '',
        raw_text: data.raw_text || '',
      })
      setPhase('confirm')
    } catch (err) {
      setError(err.message)
      setPhase('upload')
    }
  }

  function setField(field) {
    return (e) => setParsed((p) => ({ ...p, [field]: e.target.value }))
  }

  async function confirm(event) {
    event.preventDefault()
    setPhase('saving')
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/intake/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...parsed,
          skills: parsed.skills.split(',').map((s) => s.trim()).filter(Boolean),
          projects: parsed.projects.split(',').map((s) => s.trim()).filter(Boolean),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Save failed')
      }
      setSaved(await res.json())
      setPhase('done')
    } catch (err) {
      setError(err.message)
      setPhase('confirm')
    }
  }

  return (
    <section className="demo-section page-top">
      <div className="container" style={{ maxWidth: 680 }}>
        <div className="demo-card">
          <h2>Join the network</h2>
          <p className="hint">
            Drop in your CV as a PDF — the AI reads it and fills in your profile;
            you just confirm. Requires a Gemini API key in backend/.env.
          </p>

          {phase === 'upload' || phase === 'parsing' ? (
            <div className="upload-zone">
              <input
                id="cv-file"
                type="file"
                accept="application/pdf"
                onChange={onFile}
                disabled={phase === 'parsing'}
                hidden
              />
              <label htmlFor="cv-file" className={`btn btn-gradient ${phase === 'parsing' ? 'disabled' : ''}`}>
                {phase === 'parsing' ? 'Reading your CV…' : 'Choose a PDF'}
              </label>
              {phase === 'parsing' && (
                <p className="hint" style={{ marginTop: '1rem' }}>
                  Extracting roles, skills and history — a few seconds.
                </p>
              )}
            </div>
          ) : null}

          {(phase === 'confirm' || phase === 'saving') && parsed && (
            <form onSubmit={confirm} className="quiz-form">
              <label>
                <span>Name</span>
                <input value={parsed.name} onChange={setField('name')} required />
              </label>
              <label>
                <span>Title</span>
                <input value={parsed.title} onChange={setField('title')} required />
              </label>
              <label>
                <span>Field / unit</span>
                <input value={parsed.org_unit} onChange={setField('org_unit')} />
              </label>
              <label>
                <span>Skills (comma-separated)</span>
                <input value={parsed.skills} onChange={setField('skills')} />
              </label>
              <label>
                <span>Projects (comma-separated)</span>
                <input value={parsed.projects} onChange={setField('projects')} />
              </label>
              {parsed.employers.length > 0 && (
                <div>
                  <span className="field-label">Employers (from your CV)</span>
                  <ul className="employer-list">
                    {parsed.employers.map((e, i) => (
                      <li key={i}>
                        {e.org} {e.start_year || '?'}–{e.end_year || 'now'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <label>
                <span>What you want help with</span>
                <input value={parsed.ask} onChange={setField('ask')} />
              </label>
              <label>
                <span>What you can help others with</span>
                <input value={parsed.offer} onChange={setField('offer')} />
              </label>

              {error && <p className="quiz-error">{error}</p>}

              <button className="btn btn-gradient btn-submit" type="submit" disabled={phase === 'saving'}>
                {phase === 'saving' ? 'Joining the network…' : 'Looks right — add me'}
              </button>
            </form>
          )}

          {phase === 'done' && saved && (
            <div className="join-done">
              <p className="join-headline">
                Welcome, {saved.name}. You're in the graph.
              </p>
              <p className="hint">
                {saved.edges_created} connection{saved.edges_created === 1 ? '' : 's'} found
                from your history{saved.embedded ? ' (profile embedded for semantic search)' : ''}.
              </p>
              <Link className="btn btn-gradient" to="/search">
                Search as yourself →
              </Link>
            </div>
          )}

          {phase === 'upload' && error && <p className="quiz-error">{error}</p>}
        </div>
      </div>
    </section>
  )
}
