import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../api'
import AuthLayout from '../components/layout/AuthLayout'
import { Button, Chip, Icon, Notice, TextField } from '../components/ui'
import { useAuth } from '../hooks/useAuth'

const STEPS = ['About you', 'Your work', 'Give & get']
const splitList = (s) => s.split(',').map((x) => x.trim()).filter(Boolean)

// First-time setup: creates the person's profile (and their graph edges),
// then the route guard lets them into the main UI.
export default function Setup() {
  const { user, refresh, signOut } = useAuth()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    name: '', title: '', org_unit: '', skills: '', projects: [], employers: [],
    ask: '', offer: '', summary: '', raw_text: '',
  })
  const [options, setOptions] = useState({ projects: [], units: [] })
  const [busy, setBusy] = useState(null) // 'cv' | 'save'
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([api('/api/projects'), api('/api/people')])
      .then(([projects, people]) => {
        const units = [...new Set(people.map((p) => p.org_unit).filter(Boolean))].sort()
        setOptions({ projects, units })
      })
      .catch(() => {}) // pickers are a convenience; free text still works
  }, [])

  if (user.person) return <Navigate to="/" replace />

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  const toggleProject = (name) =>
    setForm((f) => ({
      ...f,
      projects: f.projects.includes(name) ? f.projects.filter((p) => p !== name) : [...f.projects, name],
    }))

  async function prefillFromCv(event) {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file) return
    setBusy('cv')
    setError(null)
    const body = new FormData()
    body.append('file', file)
    try {
      const data = await api('/api/intake/cv', { method: 'POST', body })
      setForm((f) => ({
        ...f,
        name: data.name || f.name,
        title: data.title || f.title,
        org_unit: data.org_unit || f.org_unit,
        skills: (data.skills || []).join(', ') || f.skills,
        projects: [...new Set([...f.projects, ...(data.projects || [])])],
        employers: data.employers || [],
        ask: data.ask || f.ask,
        offer: data.offer || f.offer,
        summary: data.summary || '',
        raw_text: data.raw_text || '',
      }))
    } catch (err) {
      setError(`Couldn't read that CV (${err.message}). You can fill this in by hand.`)
    } finally {
      setBusy(null)
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (step < STEPS.length - 1) {
      setStep(step + 1)
      return
    }
    setBusy('save')
    setError(null)
    try {
      await api('/api/intake/confirm', {
        method: 'POST',
        body: { ...form, skills: splitList(form.skills) },
      })
      await refresh() // user.person is now set -> redirected into the app
    } catch (err) {
      setError(err.message)
      setBusy(null)
    }
  }

  return (
    <AuthLayout
      wide
      title="Set up your profile"
      subtitle="Three quick steps so the network knows who you are and who you've worked with."
      footer={<>Signed in as {user.email}. <button type="button" className="linklike" onClick={signOut}>Sign out</button></>}
    >
      <ol className="steps" aria-label="Setup progress">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="steps__dot">{i < step ? <Icon name="check" size={12} strokeWidth={2.5} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <form className="form" onSubmit={submit}>
        {step === 0 && (
          <>
            <div className="cvdrop">
              <div>
                <strong>Have a CV handy?</strong>
                <span>Upload a PDF and we'll fill this in for you.</span>
              </div>
              <input id="cv-file" type="file" accept="application/pdf" onChange={prefillFromCv} hidden disabled={busy === 'cv'} />
              <label htmlFor="cv-file" className="ui-btn ui-btn--outline ui-btn--md">
                <Icon name="upload" size={16} />
                {busy === 'cv' ? 'Reading…' : 'Upload CV'}
              </label>
            </div>
            <TextField label="Full name" value={form.name} onChange={set('name')} autoComplete="name" required />
            <TextField label="Job title" value={form.title} onChange={set('title')} placeholder="e.g. Senior Data Scientist" required />
            <TextField label="Team or division" value={form.org_unit} onChange={set('org_unit')} placeholder="e.g. Data" list="unit-options" />
            <datalist id="unit-options">
              {options.units.map((u) => <option key={u} value={u} />)}
            </datalist>
          </>
        )}

        {step === 1 && (
          <>
            <TextField
              label="Skills"
              value={form.skills}
              onChange={set('skills')}
              placeholder="e.g. Terraform, GCP, Kubernetes"
              hint="Comma-separated. This is what people will find you for."
            />
            <fieldset className="chipset">
              <legend>Projects you've worked on</legend>
              <span className="chipset__hint">Shared projects are how we connect you to colleagues.</span>
              <div className="chipset__chips">
                {[...new Set([...options.projects, ...form.projects])].map((p) => (
                  <Chip key={p} selected={form.projects.includes(p)} onClick={() => toggleProject(p)}>{p}</Chip>
                ))}
              </div>
            </fieldset>
          </>
        )}

        {step === 2 && (
          <>
            <TextField label="What would you like help with?" value={form.ask} onChange={set('ask')} placeholder="e.g. Getting started with Kubernetes" />
            <TextField label="What can you help others with?" value={form.offer} onChange={set('offer')} placeholder="e.g. Reviewing data pipelines" />
          </>
        )}

        {error && <Notice>{error}</Notice>}

        <div className="form__actions">
          {step > 0 && (
            <Button variant="outline" size="lg" onClick={() => setStep(step - 1)} disabled={busy === 'save'}>Back</Button>
          )}
          <Button type="submit" variant="primary" size="lg" disabled={busy !== null} style={{ flexGrow: 1 }}>
            {busy === 'save' ? 'Building your network…' : step < STEPS.length - 1 ? 'Continue' : 'Finish and see my network'}
          </Button>
        </div>
      </form>
    </AuthLayout>
  )
}
