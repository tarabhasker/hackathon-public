import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { Badge, Button, Eyebrow, Icon, useToast } from '../ui'

const shortDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

function EventRow({ event }) {
  return (
    <Link to={`/events/${event.id}`} className="nw-event">
      <span className={`nw-event__dot ${event.is_open ? 'nw-event__dot--live' : ''}`} aria-hidden="true" />
      <span className="nw-event__text">
        <span className="nw-event__name">{event.name}</span>
        <span className="nw-event__meta">
          {event.member_count} {event.member_count === 1 ? 'person' : 'people'}
          {' · '}
          {event.is_open ? 'happening now' : `joined ${shortDate(event.joined_at)}`}
        </span>
      </span>
      {event.is_open ? <Badge tone="primary">Live</Badge> : <Badge>Ended</Badge>}
      <Icon name="chevron" size={15} />
    </Link>
  )
}

// The signed-in person's events: a code box to join one, then live events
// first and history below.
export default function EventsPanel() {
  const [events, setEvents] = useState(null)
  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const toast = useToast()
  const navigate = useNavigate()

  const refresh = useCallback(
    () =>
      api('/api/my/events')
        .then((data) => {
          setEvents(data)
          return data
        })
        .catch(() => {
          setEvents((prev) => prev ?? [])
          return null
        }),
    [],
  )

  useEffect(() => {
    refresh()
  }, [refresh])

  async function join(e) {
    e.preventDefault()
    const cleaned = code.trim().toLowerCase()
    if (!cleaned) return
    setJoining(true)
    try {
      const res = await api(`/api/events/${encodeURIComponent(cleaned)}/join`, { method: 'POST' })
      toast.success(res.already_joined ? `You're already in ${res.event}.` : `Welcome to ${res.event}!`)
      setCode('')
      const fresh = await refresh()
      const joined = fresh?.find((ev) => ev.name === res.event)
      if (joined) navigate(`/events/${joined.id}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setJoining(false)
    }
  }

  const live = (events || []).filter((e) => e.is_open)
  const past = (events || []).filter((e) => !e.is_open)

  return (
    <section className="nw-events">
      <Eyebrow>Join an event</Eyebrow>
      <form className="nw-joincode" onSubmit={join}>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter event code, e.g. k7m2xp9"
          aria-label="Event code"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck="false"
          maxLength={12}
        />
        <Button type="submit" variant="secondary" size="sm" disabled={joining || !code.trim()}>
          {joining ? 'Joining…' : 'Join'}
        </Button>
      </form>

      {events && events.length > 0 && (
        <>
          <Eyebrow>Your events</Eyebrow>
          {live.length > 0 && (
            <div className="nw-events__group">
              {live.map((e) => <EventRow key={e.id} event={e} />)}
            </div>
          )}
          {past.length > 0 && (
            <div className="nw-events__group">
              {live.length > 0 && <span className="nw-events__label">Earlier</span>}
              {past.map((e) => <EventRow key={e.id} event={e} />)}
            </div>
          )}
        </>
      )}
    </section>
  )
}
