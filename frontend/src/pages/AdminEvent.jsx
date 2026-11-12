import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { QrCode } from '../components/network/InvitePanel'
import { Avatar, Badge, Button, Card, Eyebrow, Icon, Notice, Spinner, TextField, useToast } from '../components/ui'
import { useCopied } from '../hooks/useCopied'
import { useCountUp } from '../hooks/useCountUp'
import { joinUrl } from '../lib/events'
import { timeAgo } from '../lib/time'

const BASE_KEY = 'bff.publicUrl'
const POLL_MS = 5000

const nameOf = (m) => m.name || m.email
const detailOf = (m) =>
  m.name ? [m.title, m.org_unit].filter(Boolean).join(' · ') || m.email : 'Profile not set up yet'

function readBase() {
  try {
    return localStorage.getItem(BASE_KEY) || ''
  } catch {
    return ''
  }
}

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`

// Fullscreen QR for projecting in a room; the join count updates live behind it.
function Present({ event, url, count, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const size = Math.round(Math.max(220, Math.min(720, Math.min(window.innerWidth, window.innerHeight) * 0.6)))

  return (
    <div className="present" role="dialog" aria-modal="true" aria-label={`QR code for ${event.name}`} onClick={onClose}>
      <h2 className="present__title">{event.name}</h2>
      <div className="present__qr" onClick={(e) => e.stopPropagation()}>
        <QrCode value={url} size={size} label={`QR code to join ${event.name}`} />
      </div>
      <p className="present__hint">Scan to join &middot; {count} joined</p>
      <code className="present__url">{url.replace(/^https?:\/\//, '')}</code>
      <span className="present__close">Click anywhere or press Esc to close</span>
    </div>
  )
}

export default function AdminEvent() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [event, setEvent] = useState(null)
  const [missing, setMissing] = useState(false)
  const [live, setLive] = useState(true)
  const [baseInput, setBaseInput] = useState(readBase)
  const [presenting, setPresenting] = useState(false)
  const [busy, setBusy] = useState(null)
  const [copied, copy] = useCopied()
  const joinedCount = useCountUp(event?.members.length ?? 0)
  const seen = useRef(null) // user ids we've already shown, to announce newcomers

  const load = useCallback(async () => {
    try {
      const data = await api(`/api/admin/events/${id}`)
      if (seen.current) {
        const fresh = data.members.filter((m) => !seen.current.has(m.user_id))
        if (fresh.length === 1) toast.info(`${nameOf(fresh[0])} just joined.`)
        else if (fresh.length > 1) toast.info(`${fresh.length} people just joined.`)
      }
      seen.current = new Set(data.members.map((m) => m.user_id))
      setEvent(data)
      setLive(true)
    } catch (err) {
      if (err.status === 404) setMissing(true)
      else setLive(false) // keep showing the last list; the pill says we're reconnecting
    }
  }, [id, toast])

  useEffect(() => {
    load()
    const timer = setInterval(() => {
      if (!document.hidden) load()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  const base = (baseInput.trim() || window.location.origin).replace(/\/+$/, '')
  const url = event ? joinUrl(base, event.code) : ''
  const localOnly = /^https?:\/\/(localhost|127\.|0\.0\.0\.0)/i.test(base)

  function changeBase(value) {
    setBaseInput(value)
    try {
      if (value.trim()) localStorage.setItem(BASE_KEY, value.trim())
      else localStorage.removeItem(BASE_KEY)
    } catch {
      // storage unavailable: the address just won't be remembered
    }
  }

  async function toggleOpen() {
    setBusy('toggle')
    try {
      const res = await api(`/api/admin/events/${id}/toggle-open`, { method: 'POST' })
      toast.success(res.is_open ? 'Event reopened — new people can join.' : 'Event closed — new scans are turned away.')
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(null)
    }
  }

  async function removeEvent() {
    if (!window.confirm(`Delete "${event.name}"? Its QR code stops working and the attendee list is lost.`)) return
    setBusy('delete')
    try {
      await api(`/api/admin/events/${id}`, { method: 'DELETE' })
      toast.success(`${event.name} deleted.`)
      navigate('/admin', { replace: true })
    } catch (err) {
      toast.error(err.message)
      setBusy(null)
    }
  }

  function exportCsv() {
    const rows = [
      ['Name', 'Email', 'Title', 'Team', 'Joined (UTC)'],
      ...event.members.map((m) => [m.name || '', m.email, m.title || '', m.org_unit || '', m.joined_at]),
    ]
    const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    link.download = `${event.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'event'}-attendees.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  if (missing) {
    return (
      <div className="admin">
        <Card className="admin-empty">
          <span>That room doesn't exist (it may have been deleted).</span>
          <Button to="/admin/rooms" variant="outline">Back to rooms</Button>
        </Card>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="admin admin--loading" role="status">
        <Spinner size={22} /> Loading event…
      </div>
    )
  }

  return (
    <div className="admin">
      <Link to="/admin/rooms" className="ev-back">
        <Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} /> All rooms
      </Link>

      <header className="ev-head">
        <div>
          <h1>
            {event.name} <Badge tone={event.is_open ? 'primary' : 'warn'}>{event.is_open ? 'Open' : 'Closed'}</Badge>
          </h1>
          {event.description && <p className="ev-head__desc">{event.description}</p>}
        </div>
        <div className="ev-head__actions">
          <Button variant="outline" disabled={busy !== null} onClick={toggleOpen}>
            {busy === 'toggle' && <Spinner size={14} />}
            {event.is_open ? 'Close event' : 'Reopen event'}
          </Button>
          <Button variant="outline" disabled={busy !== null} onClick={removeEvent} aria-label="Delete event">
            <Icon name="trash" size={16} />
          </Button>
        </div>
      </header>

      <div className="ev-grid">
        <Card className="ev-qr">
          <Eyebrow>Scan to join</Eyebrow>
          <div className="ev-qr__code">
            <QrCode value={url} size={232} label={`QR code to join ${event.name}`} />
          </div>
          <Button variant="primary" block onClick={() => setPresenting(true)}>
            <Icon name="expand" size={16} /> Show full screen
          </Button>

          <div className="ev-qr__link">
            <input type="text" readOnly value={url.replace(/^https?:\/\//, '')} aria-label="Join link" onFocus={(e) => e.target.select()} />
            <Button variant="outline" onClick={() => copy(url)} style={{ minWidth: 84 }}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <TextField
            label="Site address in the QR"
            value={baseInput}
            onChange={(e) => changeBase(e.target.value)}
            placeholder={window.location.origin}
            hint="Where people open the app. Leave blank to use this browser's address."
          />
          {localOnly && (
            <Notice tone="warn">
              Phones can't open {new URL(base).host}. Paste your deployed URL (or your laptop's network
              address) above so the QR works on other devices.
            </Notice>
          )}
        </Card>

        <Card className="ev-people">
          <div className="ev-people__head">
            <div>
              <Eyebrow>Joined</Eyebrow>
              <span className="ev-people__count">{joinedCount}</span>
            </div>
            <div className="ev-people__tools">
              <span className={`ev-live ${live ? '' : 'ev-live--off'}`}>{live ? 'Live' : 'Reconnecting…'}</span>
              <Button variant="outline" size="sm" disabled={event.members.length === 0} onClick={exportCsv}>
                <Icon name="download" size={14} /> Export CSV
              </Button>
            </div>
          </div>

          {event.members.length === 0 ? (
            <div className="ev-people__empty">
              <Icon name="users" size={22} />
              <span>Nobody yet. Show the QR code — people appear here the moment they join.</span>
            </div>
          ) : (
            <ul className="ev-people__list">
              {event.members.map((m) => (
                <li key={m.user_id} className="att" title={m.email}>
                  <Avatar name={nameOf(m)} size={36} tone="secondary" />
                  <div className="att__main">
                    <span className="att__name">{nameOf(m)}</span>
                    <span className="att__sub">{detailOf(m)}</span>
                  </div>
                  <span className="att__when">{timeAgo(m.joined_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {presenting && <Present event={event} url={url} count={event.members.length} onClose={() => setPresenting(false)} />}
    </div>
  )
}
