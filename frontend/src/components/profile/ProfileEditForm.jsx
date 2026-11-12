import { useState } from 'react'
import { api } from '../../api'
import { Button, Notice, Spinner, TextField } from '../ui'
import AvatarUploader from './AvatarUploader'

const splitList = (s) => s.split(',').map((x) => x.trim()).filter(Boolean)

// Edit form for your own profile. onSaved gets the updated profile;
// onAvatar gets the new photo URL as soon as a photo is uploaded or removed.
export default function ProfileEditForm({ profile, onSaved, onAvatar, onCancel }) {
  const [form, setForm] = useState({
    name: profile.name || '',
    title: profile.title || '',
    org_unit: profile.org_unit || '',
    skills: profile.skills.join(', '),
    offer: profile.offer || '',
    ask: profile.ask || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const saved = await api('/api/profile', {
        method: 'PUT',
        body: { ...form, skills: splitList(form.skills) },
      })
      onSaved(saved)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <AvatarUploader name={form.name} avatarUrl={profile.avatar_url} onChange={onAvatar} />
      <TextField label="Full name" value={form.name} onChange={set('name')} autoComplete="name" required />
      <TextField label="Job title" value={form.title} onChange={set('title')} />
      <TextField label="Team or division" value={form.org_unit} onChange={set('org_unit')} />
      <TextField
        label="Skills"
        value={form.skills}
        onChange={set('skills')}
        hint="Comma-separated. This is what people will find you for."
      />
      <TextField label="What can you help others with?" value={form.offer} onChange={set('offer')} />
      <TextField label="What would you like help with?" value={form.ask} onChange={set('ask')} />
      {error && <Notice>{error}</Notice>}
      <div className="form__actions">
        <Button variant="outline" size="lg" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" variant="primary" size="lg" disabled={saving} style={{ flexGrow: 1 }}>
          {saving ? <><Spinner size={14} /> Saving…</> : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
