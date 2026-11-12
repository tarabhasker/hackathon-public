import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { CHART_COLORS, ConnectionsSplit, JoinsArea, Sparkline, TeamBars } from '../components/admin/Charts'
import { Avatar, Button, Card, Eyebrow, Icon, Spinner, TextField, useToast } from '../components/ui'
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
  const counted = useCountUp(value)
  return (
    <Card className="admin-stat">
      <span className="admin-stat__value">{counted.toLocaleString()}</span>
      <span className="admin-stat__label">{label}</span>
      {sub && <span className="admin-stat__sub">{sub}</span>}
    </Card>
  )
}

function EventCard({ event, index }) {
  const joined = useCountUp(Number(event.member_count))
  return (
    <Link
      to={`/admin/events/${event.id}`}
      className="admin-event"
      style={{ '--d': `${Math.min(index * 55, 330)}ms` }}
    >
      <div className="admin-event__top">
        <strong className="admin-event__name">{event.name}</strong>
        <span className={`ev-state ${event.is_open ? 'ev-state--open' : 'ev-state--closed'}`}>
          {event.is_open ? 'Open' : 'Closed'}
        </span>
      </div>
      {event.description && <span className="admin-event__desc">{event.description}</span>}

      <div className="admin-event__row">
        <div className="admin-event__joined">
          <span className="admin-event__count">{joined.toLocaleString()}</span>
          <span className="admin-event__unit">joined</span>
        </div>
        <Sparkline data={event.spark} color={CHART_COLORS[index % CHART_COLORS.length]} />
      </div>

      <div className="admin-event__meta">
        {event.members_preview.length > 0 ? (
          <span className="admin-event__faces">
            {event.members_preview.map((name) => (
              <Avatar key={name} name={name} size={24} tone="secondary" />
            ))}
            {event.member_count > event.members_preview.length && (
              <i className="admin-event__more">+{event.member_count - event.members_preview.length}</i>
            )}
          </span>
        ) : (
          <span className="admin-dim">Nobody yet — share the QR</span>
        )}
        <span>{event.last_joined_at ? `last join ${timeAgo(event.last_joined_at)}` : timeAgo(event.created_at)}</span>
      </div>
      <span className="admin-event__go" aria-hidden="true"><Icon name="chevron" size={16} /></span>
    </Link>
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

  const joinsThisWeek = overview.joins_by_day.slice(-7).reduce((s, d) => s + Number(d.count), 0)
  const openEvents = events.filter((e) => e.is_open).length
  // open events first, then by recency — the ones being hosted now matter most
  const sortedEvents = [...events].sort((a, b) => b.is_open - a.is_open)

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
          <Stat label="Events hosted" value={events.length} sub={`${openEvents} open now`} />
          <Stat label="Event joins" value={Number(overview.event_joins)} sub={`${joinsThisWeek} in the last 7 days`} />
          <Stat label="People in the network" value={Number(overview.people)} />
          <Stat label="Connections between them" value={Number(overview.edges)} />
        </div>
        <div className="admin-viz">
          <div className="admin-viz__wide">
            <Card className="viz-card">
              <JoinsArea data={overview.joins_by_day} />
            </Card>
          </div>
          <Card className="viz-card">
            <TeamBars data={overview.people_by_unit} />
          </Card>
          <Card className="viz-card">
            <ConnectionsSplit data={overview.edges_by_type} labels={EDGE_LABELS} />
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
            {sortedEvents.map((ev, i) => (
              <EventCard key={ev.id} event={ev} index={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
