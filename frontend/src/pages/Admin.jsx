import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Badge, Button, Card, Eyebrow, Icon, Spinner, TextField, useToast } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useCountUp } from '../hooks/useCountUp'
import { timeAgo } from '../lib/time'

function Stat({ label, value, sub }) {
  // animate plain numbers; leave formatted values ("94%", "6,067") as they are
  const numeric = typeof value === 'number'
  const counted = useCountUp(numeric ? value : 0)
  return (
    <Card className="admin-stat">
      <span className="admin-stat__value">{numeric ? counted : value}</span>
      <span className="admin-stat__label">{label}</span>
      {sub && <span className="admin-stat__sub">{sub}</span>}
    </Card>
  )
}

export default function Admin() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [overview, setOverview] = useState(null)
  const [users, setUsers] = useState(null)
  const [events, setEvents] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [draft, setDraft] = useState({ name: '', description: '' })
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const [ov, us, ev] = await Promise.all([
        api('/api/admin/overview'),
        api('/api/admin/users'),
        api('/api/admin/events'),
      ])
      setOverview(ov)
      setUsers(us)
      setEvents(ev)
    } catch (err) {
      toast.error(err.message)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  async function createEvent(e) {
    e.preventDefault()
    setCreating(true)
    try {
      const created = await api('/api/admin/events', { method: 'POST', body: draft })
      toast.success(`${created.name} is ready — share its QR code.`)
      navigate(`/admin/events/${created.id}`)
    } catch (err) {
      toast.error(err.message)
      setCreating(false)
    }
  }

  async function toggleAdmin(u) {
    setBusyId(u.id)
    try {
      const res = await api(`/api/admin/users/${u.id}/toggle-admin`, { method: 'POST' })
      toast.success(`${u.email} is ${res.is_admin ? 'now an admin' : 'no longer an admin'}`)
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function deletePerson(u) {
    if (!window.confirm(`Delete ${u.person_name}'s profile from the network? This removes their edges too.`)) return
    setBusyId(u.id)
    try {
      await api(`/api/admin/people/${u.person_id}`, { method: 'DELETE' })
      toast.success(`${u.person_name} removed from the network`)
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusyId(null)
    }
  }

  if (!overview || !users || !events) {
    return (
      <div className="admin admin--loading" role="status">
        <Spinner size={22} /> Loading admin data…
      </div>
    )
  }

  const embeddedPct = overview.facets
    ? Math.round((overview.embedded_facets / overview.facets) * 100)
    : 0
  const totalJoined = events.reduce((sum, ev) => sum + Number(ev.member_count), 0)

  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <h1>Welcome back</h1>
          <p className="admin-head__sub">Host events, watch the room fill up, and keep the network tidy.</p>
        </div>
        <span className="admin-head__who">{user.email}</span>
      </header>

      <section className="admin-section" style={{ '--d': '0ms' }}>
        <Card className="admin-create">
          <div className="admin-create__copy">
            <h2>Host an event</h2>
            <p>
              Every event gets its own QR code. People scan it, sign in or register,
              and appear in your attendee list the moment they join.
            </p>
          </div>
          <form className="admin-create__form" onSubmit={createEvent}>
            <TextField
              label="Event name"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="e.g. Hackathon kickoff mixer"
              maxLength={120}
              required
              disabled={creating}
            />
            <TextField
              label="Description (optional)"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="Shown to people when they scan the code"
              disabled={creating}
            />
            <Button type="submit" variant="primary" size="lg" disabled={creating || !draft.name.trim()}>
              {creating ? <><Spinner size={16} /> Creating…</> : <>Create & get QR <Icon name="chevron" size={15} /></>}
            </Button>
          </form>
        </Card>
      </section>

      <section className="admin-section" style={{ '--d': '70ms' }}>
        <Eyebrow>Your events</Eyebrow>
        {events.length === 0 ? (
          <Card className="admin-empty">
            <Icon name="calendar" size={22} />
            <span>No events yet. Create one above, then show its QR code so people can scan to join.</span>
          </Card>
        ) : (
          <div className="admin-events">
            {events.map((ev, i) => (
              <Link
                key={ev.id}
                to={`/admin/events/${ev.id}`}
                className="admin-event"
                style={{ '--d': `${Math.min(i * 55, 330)}ms` }}
              >
                <div className="admin-event__top">
                  <strong className="admin-event__name">{ev.name}</strong>
                  <span className={`ev-state ${ev.is_open ? 'ev-state--open' : 'ev-state--closed'}`}>
                    {ev.is_open ? 'Open' : 'Closed'}
                  </span>
                </div>
                {ev.description && <span className="admin-event__desc">{ev.description}</span>}
                <div className="admin-event__meta">
                  <span><Icon name="users" size={14} /> {ev.member_count} joined</span>
                  <span>{timeAgo(ev.created_at)}</span>
                </div>
                <span className="admin-event__go" aria-hidden="true"><Icon name="chevron" size={16} /></span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="admin-section" style={{ '--d': '140ms' }}>
        <Eyebrow>Overview</Eyebrow>
        <div className="admin-stats">
          <Stat label="Events" value={events.length} sub={`${totalJoined} total joins`} />
          <Stat label="Accounts" value={overview.users} />
          <Stat
            label="People in graph"
            value={overview.people}
            sub={`${overview.real_people} real · ${overview.people - overview.real_people} synthetic`}
          />
          <Stat label="Edges" value={overview.edges.toLocaleString()} />
          <Stat label="Facets embedded" value={`${embeddedPct}%`} sub={`${overview.embedded_facets}/${overview.facets}`} />
          <Stat label="Quiz entries" value={overview.quiz_entries} />
        </div>
      </section>

      <section className="admin-section" style={{ '--d': '210ms' }}>
        <Eyebrow>Accounts</Eyebrow>
        <Card className="admin-tablewrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Profile</th>
                <th>Role</th>
                <th>Created</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.person_name || <span className="admin-dim">no profile yet</span>}</td>
                  <td>{u.is_admin ? <Badge tone="primary">admin</Badge> : <span className="admin-dim">member</span>}</td>
                  <td className="admin-dim">{String(u.created_at).slice(0, 10)}</td>
                  <td className="admin-actions">
                    {u.id !== user.id && (
                      <Button variant="outline" size="sm" disabled={busyId === u.id} onClick={() => toggleAdmin(u)}>
                        {u.is_admin ? 'Remove admin' : 'Make admin'}
                      </Button>
                    )}
                    {u.person_id && (
                      <Button variant="outline" size="sm" disabled={busyId === u.id} onClick={() => deletePerson(u)}>
                        Delete profile
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  )
}
