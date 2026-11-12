import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { Badge, Eyebrow, Icon } from '../ui'

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

// The signed-in person's events: live ones first, then history.
// Rendered under the suggestions; hidden entirely until they've joined one.
export default function EventsPanel() {
  const [events, setEvents] = useState(null)

  useEffect(() => {
    let alive = true
    api('/api/my/events')
      .then((data) => alive && setEvents(data))
      .catch(() => alive && setEvents([]))
    return () => {
      alive = false
    }
  }, [])

  if (!events || events.length === 0) return null
  const live = events.filter((e) => e.is_open)
  const past = events.filter((e) => !e.is_open)

  return (
    <section className="nw-events">
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
    </section>
  )
}
