import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { AreaChart, BarList } from '../components/admin/Charts'
import { Button, Card, Eyebrow, Icon, Spinner, TextField, useToast } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useCountUp } from '../hooks/useCountUp'
import { timeAgo } from '../lib/time'

const EDGE_LABELS = {
  project: 'Shared project',
  employer: 'Same employer',
  declared: 'Declared',
  school: 'Same school',
  semantic: 'Similar expertise',
}

function Stat({ label, value, sub }) {
  // animate plain numbers; leave formatted values ("94%") as they are
  const numeric = typeof value === 'number'
  const counted = useCountUp(numeric ? value : 0)
  return (
    <Card className="admin-stat">
      <span className="admin-stat__value">{numeric ? counted.toLocaleString() : value}</span>
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
  const [events, setEvents] = useState(null)
  const [draft, setDraft] = useState({ name: '', description: '' })
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const [ov, ev] = await Promise.all([api('/api/admin/overview'), api('/api/admin/events')])
      setOverview(ov)
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

  if (!overview || !events) {
    return (
      <div className="admin admin--loading" role="status">
        <Spinner size={22} /> Loading admin data…
      </div>
    )
  }

  const embeddedPct = overview.facets
    ? Math.round((overview.embedded_facets / overview.facets) * 100)
    : 0

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
        <Eyebrow>Overview</Eyebrow>
        <div className="admin-stats">
          <Stat label="Event joins" value={overview.event_joins} sub={`across ${events.length} events`} />
          <Stat
            label="People in graph"
            value={overview.people}
            sub={`${overview.real_people} real · ${overview.people - overview.real_people} synthetic`}
          />
          <Stat label="Accounts" value={overview.users} />
          <Stat label="Connections" value={overview.edges} />
          <Stat label="Profiles embedded" value={`${embeddedPct}%`} sub={`${overview.embedded_facets}/${overview.facets} facets`} />
        </div>
        <div className="admin-viz">
          <div className="admin-viz__wide">
            <Card className="viz-card">
              <AreaChart title="Event joins — last 14 days" data={overview.joins_by_day} />
            </Card>
          </div>
          <Card className="viz-card">
            <BarList
              title="People by team"
              data={overview.people_by_unit}
              labelOf={(d) => d.unit}
              valueOf={(d) => d.count}
            />
          </Card>
          <Card className="viz-card">
            <BarList
              title="How people are connected"
              data={overview.edges_by_type}
              labelOf={(d) => EDGE_LABELS[d.type] || d.type}
              valueOf={(d) => d.count}
            />
          </Card>
        </div>
      </section>

      <section className="admin-section" style={{ '--d': '80ms' }}>
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

      <section className="admin-section" style={{ '--d': '160ms' }}>
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
    </div>
  )
}
