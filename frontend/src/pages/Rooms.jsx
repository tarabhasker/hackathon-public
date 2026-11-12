import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { CHART_COLORS, Sparkline } from '../components/admin/Charts'
import { Avatar, Button, Card, Eyebrow, Icon, Spinner, TextField, useToast } from '../components/ui'
import { useCountUp } from '../hooks/useCountUp'
import { timeAgo } from '../lib/time'

function RoomCard({ event, index }) {
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

export default function Rooms() {
  const toast = useToast()
  const navigate = useNavigate()
  const [events, setEvents] = useState(null)
  const [draft, setDraft] = useState({ name: '', description: '' })
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      setEvents(await api('/api/admin/events'))
    } catch (err) {
      toast.error(err.message)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  async function createRoom(e) {
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

  if (!events) {
    return (
      <div className="admin admin--loading" role="status">
        <Spinner size={22} /> Loading rooms…
      </div>
    )
  }

  const sorted = [...events].sort((a, b) => b.is_open - a.is_open)

  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <h1>Rooms</h1>
          <p className="admin-head__sub">Open a room, put its QR on the screen, and watch people walk in.</p>
        </div>
      </header>

      <section className="admin-section" style={{ '--d': '0ms' }}>
        <Card className="admin-create">
          <div className="admin-create__copy">
            <h2>Open a new room</h2>
            <p>
              Every room gets its own QR code. People scan it, sign in or register,
              and appear in your attendee list the moment they join.
            </p>
          </div>
          <form className="admin-create__form" onSubmit={createRoom}>
            <TextField
              label="Room name"
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

      <section className="admin-section" style={{ '--d': '80ms' }}>
        <Eyebrow>Your rooms</Eyebrow>
        {events.length === 0 ? (
          <Card className="admin-empty">
            <Icon name="calendar" size={22} />
            <span>No rooms yet. Open one above, then show its QR code so people can scan to join.</span>
          </Card>
        ) : (
          <div className="admin-events">
            {sorted.map((ev, i) => (
              <RoomCard key={ev.id} event={ev} index={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
