import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, assetUrl } from '../api'
import CoffeeChatInvite from '../components/coffee/CoffeeChatInvite'
import { Avatar, Badge, Button, Card, Eyebrow, Icon, Notice, Spinner, useToast } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { coffeeChatUrl } from '../lib/coffeeChat'
import { firstName } from '../lib/network'

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const MONTH_FMT = { month: 'long', year: 'numeric' }
const TIME_FMT = { hour: 'numeric', minute: '2-digit' }
const DATE_FMT = { weekday: 'short', day: 'numeric', month: 'short' }

// Six weeks around `anchor`'s month, Monday first — enough cells for any month.
function monthDays(anchor) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const start = new Date(first)
  start.setDate(1 - ((first.getDay() + 6) % 7))
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

// Your coffee chats on a month grid, with scheduling right beside it.
export default function Calendar() {
  const me = useAuth().user.person
  const toast = useToast()
  const [chats, setChats] = useState(null)
  const [error, setError] = useState(null)
  const [month, setMonth] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(null) // dayKey | null
  const [people, setPeople] = useState([]) // 1st-degree connections for the picker
  const [personId, setPersonId] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(
    () =>
      api('/api/coffee-chats')
        .then((data) => {
          setChats(data)
          setError(null)
        })
        .catch((err) => setError(err.message)),
    [],
  )

  useEffect(() => {
    load()
    api('/api/network?degrees=1')
      .then((net) => setPeople(net.nodes.filter((n) => n.depth === 1)))
      .catch(() => {}) // the picker is a convenience; the list still works
  }, [load])

  const byDay = useMemo(() => {
    const map = {}
    ;(chats || []).forEach((c) => {
      const k = dayKey(new Date(c.starts_at))
      ;(map[k] ??= []).push(c)
    })
    return map
  }, [chats])

  const now = Date.now()
  const visible = useMemo(() => {
    let list = chats || []
    if (selectedDay) list = list.filter((c) => dayKey(new Date(c.starts_at)) === selectedDay)
    return {
      upcoming: list.filter((c) => new Date(c.starts_at).getTime() + c.duration_minutes * 60_000 >= now),
      past: list.filter((c) => new Date(c.starts_at).getTime() + c.duration_minutes * 60_000 < now).reverse(),
    }
  }, [chats, selectedDay, now])

  async function cancel(chat) {
    const other = chat.is_inviter ? chat.invitee : chat.inviter
    if (!window.confirm(`Cancel your coffee chat with ${other.name}? (Remember to delete the calendar event too.)`)) return
    setBusyId(chat.id)
    try {
      await api(`/api/coffee-chats/${chat.id}`, { method: 'DELETE' })
      toast.success(`Coffee chat with ${firstName(other.name)} cancelled.`)
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const recipient = people.find((p) => String(p.id) === personId) || null
  const days = monthDays(month)
  const todayKey = dayKey(new Date())

  if (error && !chats) {
    return (
      <div className="cal"><Notice>{error}</Notice></div>
    )
  }
  if (!chats) {
    return (
      <div className="cal cal--loading" role="status">
        <Spinner size={22} /> Loading your calendar…
      </div>
    )
  }

  return (
    <div className="cal">
      <header className="cal-head">
        <div>
          <h1>Calendar</h1>
          <span>Your coffee chats — scheduled from the network, the rooms, or right here.</span>
        </div>
      </header>

      <div className="cal-grid">
        <section className="cal-main">
          <Card className="cal-month">
            <div className="cal-month__bar">
              <Eyebrow>{month.toLocaleDateString(undefined, MONTH_FMT)}</Eyebrow>
              <div className="cal-month__nav">
                <Button variant="outline" size="sm" iconOnly aria-label="Previous month"
                  onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
                  <Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} />
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setMonth(new Date()); setSelectedDay(null) }}>
                  Today
                </Button>
                <Button variant="outline" size="sm" iconOnly aria-label="Next month"
                  onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
                  <Icon name="chevron" size={14} />
                </Button>
              </div>
            </div>

            <div className="cal-month__dows" aria-hidden="true">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="cal-month__days">
              {days.map((d) => {
                const k = dayKey(d)
                const dayChats = byDay[k] || []
                const out = d.getMonth() !== month.getMonth()
                return (
                  <button
                    key={k}
                    type="button"
                    className={[
                      'cal-day',
                      out && 'cal-day--out',
                      k === todayKey && 'cal-day--today',
                      k === selectedDay && 'cal-day--selected',
                      dayChats.length > 0 && 'cal-day--busy',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setSelectedDay((cur) => (cur === k ? null : k))}
                    aria-label={`${d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}: ${dayChats.length} coffee chat${dayChats.length === 1 ? '' : 's'}`}
                    aria-pressed={k === selectedDay}
                  >
                    <span className="cal-day__num">{d.getDate()}</span>
                    {dayChats.length > 0 && (
                      <span className="cal-day__dots" aria-hidden="true">
                        {dayChats.slice(0, 3).map((c) => <i key={c.id} />)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </Card>

          <Card className="cal-list">
            <div className="cal-list__head">
              <Eyebrow>
                {selectedDay ? 'Coffee chats that day' : 'Upcoming coffee chats'}
              </Eyebrow>
              {selectedDay && (
                <Button variant="outline" size="sm" onClick={() => setSelectedDay(null)}>Show all</Button>
              )}
            </div>

            {visible.upcoming.length === 0 && visible.past.length === 0 && (
              <p className="cal-empty">
                {selectedDay
                  ? 'No coffee chats on this day.'
                  : 'Nothing scheduled yet — pick a connection on the right and send your first invite. ☕'}
              </p>
            )}

            <ul className="cal-chats">
              {visible.upcoming.map((c) => <ChatRow key={c.id} chat={c} onCancel={cancel} busy={busyId === c.id} />)}
            </ul>
            {visible.past.length > 0 && (
              <>
                <span className="cal-list__earlier">Earlier</span>
                <ul className="cal-chats cal-chats--past">
                  {visible.past.map((c) => <ChatRow key={c.id} chat={c} onCancel={cancel} busy={busyId === c.id} past />)}
                </ul>
              </>
            )}
          </Card>
        </section>

        <aside className="cal-aside">
          <Card className="cal-pick">
            <Eyebrow>Schedule a coffee chat</Eyebrow>
            <label className="cal-pick__label" htmlFor="cal-person">With one of your connections</label>
            <select
              id="cal-person"
              className="cal-pick__select"
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
            >
              <option value="">Pick a connection…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.title ? ` — ${p.title}` : ''}
                </option>
              ))}
            </select>
            {people.length === 0 && (
              <p className="cal-empty">
                No direct connections yet. <Link to="/">Meet people on your network</Link> first.
              </p>
            )}
          </Card>
          <CoffeeChatInvite
            sender={me}
            recipient={recipient}
            emptyText="Pick a 1st-degree connection above and the kopi invite is one click away."
            onInvite={() => setTimeout(load, 600)}
          />
        </aside>
      </div>
    </div>
  )
}

function ChatRow({ chat, onCancel, busy, past = false }) {
  const other = chat.is_inviter ? chat.invitee : chat.inviter
  const start = new Date(chat.starts_at)
  const gcal = coffeeChatUrl({
    sender: { name: chat.inviter.name },
    recipient: { name: chat.invitee.name, email: chat.invitee.email },
    start,
    durationMinutes: chat.duration_minutes,
    eventName: chat.event_name,
    location: chat.location,
  })
  return (
    <li className={`cal-chat ${past ? 'cal-chat--past' : ''}`}>
      <Link to={`/people/${other.id}`} className="cal-chat__who">
        <Avatar name={other.name} src={assetUrl(other.avatar_url)} size={38} tone="primary-soft" />
      </Link>
      <span className="cal-chat__text">
        <span className="cal-chat__title">
          Coffee with <Link to={`/people/${other.id}`}>{other.name}</Link>
          {!chat.is_inviter && <Badge>invited you</Badge>}
        </span>
        <span className="cal-chat__meta">
          {start.toLocaleDateString(undefined, DATE_FMT)} · {start.toLocaleTimeString(undefined, TIME_FMT)}
          {' · '}{chat.duration_minutes} min
          {chat.location ? ` · ${chat.location}` : ''}
          {chat.event_name ? ` · met at ${chat.event_name}` : ''}
        </span>
      </span>
      <span className="cal-chat__actions">
        {!past && (
          <Button href={gcal} target="_blank" rel="noopener noreferrer" variant="outline" size="sm">
            <Icon name="calendar" size={14} /> GCal
          </Button>
        )}
        <Button variant="outline" size="sm" iconOnly aria-label="Cancel coffee chat" disabled={busy} onClick={() => onCancel(chat)}>
          <Icon name="trash" size={14} />
        </Button>
      </span>
    </li>
  )
}
