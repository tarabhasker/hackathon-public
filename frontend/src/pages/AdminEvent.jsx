import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import RoomGraph from '../components/admin/RoomGraph'
import { QrCode } from '../components/network/InvitePanel'
import { Avatar, Badge, Button, Card, Chip, Eyebrow, Icon, Spinner, TextField, useToast } from '../components/ui'
import { useCopied } from '../hooks/useCopied'
import { useCountUp } from '../hooks/useCountUp'
import { joinUrl } from '../lib/events'

const POLL_MS = 5000

const nameOf = (m) => m.name || m.email

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
  const [graph, setGraph] = useState(null)
  const [missing, setMissing] = useState(false)
  const [live, setLive] = useState(true)
  const [presenting, setPresenting] = useState(false)
  const [busy, setBusy] = useState(null)
  const [copied, copy] = useCopied()
  const [focusTeam, setFocusTeam] = useState(null)
  const [domains, setDomains] = useState('')
  const qrBox = useRef(null)
  const joinedCount = useCountUp(event?.members.length ?? 0)

  useEffect(() => {
    if (event) setDomains(event.allowed_domains || '')
  }, [event?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const teams = graph ? [...new Set(graph.nodes.map((n) => n.org_unit).filter(Boolean))].sort() : []
  const nodeById = graph ? Object.fromEntries(graph.nodes.map((n) => [n.id, n])) : {}
  const aiPairs = graph
    ? graph.edges.filter((e) => e.semantic).sort((x, y) => y.weight - x.weight).slice(0, 5)
    : []
  const historyTies = graph ? graph.edges.filter((e) => !e.semantic).length : 0
  const aiTies = graph ? graph.edges.filter((e) => e.semantic).length : 0

  async function copyIntro(pair) {
    const a = nodeById[pair.a]
    const b = nodeById[pair.b]
    const first = (n) => n.name.split(' ')[0]
    const text =
      `Hi ${first(a)}, hi ${first(b)} — you two should meet at ${event.name}! ` +
      `${a.name} (${a.title || 'profile pending'}) and ${b.name} (${b.title || 'profile pending'}) ` +
      `have a ${Math.round(pair.weight * 100)}% expertise match. Go say hello 👋`
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`Intro for ${first(a)} & ${first(b)} copied — paste it anywhere.`)
    } catch {
      toast.error("Couldn't reach the clipboard — copy it from the room graph instead.")
    }
  }
  const seen = useRef(null) // user ids we've already shown, to announce newcomers

  const load = useCallback(async () => {
    try {
      const [data, g] = await Promise.all([
        api(`/api/admin/events/${id}`),
        api(`/api/admin/events/${id}/graph`),
      ])
      if (seen.current) {
        const fresh = data.members.filter((m) => !seen.current.has(m.user_id))
        if (fresh.length === 1) toast.info(`${nameOf(fresh[0])} just joined.`)
        else if (fresh.length > 1) toast.info(`${fresh.length} people just joined.`)
      }
      seen.current = new Set(data.members.map((m) => m.user_id))
      setEvent(data)
      setGraph(g)
      setLive(true)
    } catch (err) {
      if (err.status === 404) setMissing(true)
      else setLive(false) // keep showing the last graph; the pill says we're reconnecting
    }
  }, [id, toast])

  useEffect(() => {
    load()
    const timer = setInterval(() => {
      if (!document.hidden) load()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  const url = event ? joinUrl(window.location.origin, event.code) : ''

  async function shareLink() {
    try {
      if (navigator.share) {
        await navigator.share({ title: event.name, text: `Join ${event.name}`, url })
        return
      }
    } catch (err) {
      if (err.name === 'AbortError') return // they closed the share sheet
    }
    const ok = await copy(url)
    if (ok) toast.success('Link copied — share it anywhere.')
  }

  function downloadPng() {
    const svg = qrBox.current?.querySelector('svg')
    if (!svg) return
    const xml = new XMLSerializer()
      .serializeToString(svg)
      .replaceAll('var(--secondary)', '#1B1613')
    const img = new Image()
    img.onload = () => {
      const SIZE = 640
      const PAD = 48
      const canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, SIZE, SIZE)
      ctx.drawImage(img, PAD, PAD, SIZE - 2 * PAD, SIZE - 2 * PAD)
      canvas.toBlob((blob) => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `${event.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'room'}-qr.png`
        a.click()
        URL.revokeObjectURL(a.href)
      })
      toast.success('QR code saved as a PNG.')
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
  }

  async function saveDomains() {
    const next = domains.trim()
    if ((event.allowed_domains || '') === next) return
    try {
      const updated = await api(`/api/admin/events/${id}/settings`, {
        method: 'POST',
        body: { allowed_domains: next || null },
      })
      setEvent((ev) => ({ ...ev, allowed_domains: updated.allowed_domains }))
      setDomains(updated.allowed_domains || '')
      toast.success(
        updated.allowed_domains
          ? `Only ${updated.allowed_domains.split(',').map((d) => '@' + d).join(', ')} emails can join now.`
          : 'Anyone with the link can join now.',
      )
    } catch (err) {
      toast.error(err.message)
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
          <Button variant="outline" disabled={busy !== null} onClick={removeEvent} aria-label="Delete room">
            <Icon name="trash" size={16} />
          </Button>
        </div>
      </header>

      <div className="ev-grid">
        <Card className="ev-qr">
          <Eyebrow>Scan to join</Eyebrow>
          <div className="ev-qr__code" ref={qrBox}>
            <QrCode value={url} size={156} label={`QR code to join ${event.name}`} />
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

          <div className="ev-qr__actions">
            <Button variant="outline" size="sm" onClick={shareLink}>
              <Icon name="share" size={15} /> Share
            </Button>
            <Button variant="outline" size="sm" onClick={downloadPng}>
              <Icon name="download" size={15} /> Save PNG
            </Button>
          </div>

          <div className="ev-qr__group">
            <span className="ev-qr__grouplabel">Who can join</span>
            <div className="ev-switchrow">
              <span className="ev-switchrow__text">
                <b>Accepting new people</b>
                <small>{event.is_open ? 'Scans let newcomers in' : 'New scans are turned away'}</small>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={event.is_open}
                aria-label="Accepting new people"
                className={`ui-switch ${event.is_open ? 'ui-switch--on' : ''}`}
                disabled={busy !== null}
                onClick={toggleOpen}
              >
                <i />
              </button>
            </div>
            <TextField
              label="Limit to email domains"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              onBlur={saveDomains}
              onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
              placeholder="e.g. gamuda.tech, gmail.com"
              hint="Comma separated. Blank = anyone with the link."
            />
          </div>
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
          ) : graph ? (
            <>
              <div className="ev-toolbar">
                <span className="ev-ties">
                  <b>{historyTies}</b> connections · <b>{aiTies}</b> suggested · <b>{teams.length}</b> teams
                </span>
                {teams.length > 1 && (
                  <div className="ev-teamchips">
                    <Chip selected={focusTeam === null} onClick={() => setFocusTeam(null)}>Everyone</Chip>
                    {teams.map((t) => (
                      <Chip key={t} selected={focusTeam === t} onClick={() => setFocusTeam((p) => (p === t ? null : t))}>
                        {t}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
              <RoomGraph nodes={graph.nodes} edges={graph.edges} focusTeam={focusTeam} />
            </>
          ) : (
            <div className="ev-people__empty" role="status"><Spinner size={18} /> Drawing the room…</div>
          )}
        </Card>
      </div>

      {aiPairs.length > 0 && (
        <Card className="ev-intros">
          <div className="ev-intros__head">
            <div>
              <Eyebrow>Suggested introductions</Eyebrow>
              <span className="ev-intros__sub">
                Strong expertise matches in the room who aren't connected yet.
              </span>
            </div>
          </div>
          <ul className="ev-intros__list">
            {aiPairs.map((p, i) => {
              const a = nodeById[p.a]
              const b = nodeById[p.b]
              if (!a || !b) return null
              return (
                <li key={`${p.a}-${p.b}`} className="intro" style={{ '--d': `${i * 60}ms` }}>
                  <span className="intro__faces">
                    <Avatar name={a.name} size={30} tone="secondary" />
                    <Avatar name={b.name} size={30} tone="primary-soft" />
                  </span>
                  <span className="intro__who">
                    <b>{a.name} × {b.name}</b>
                    <small>{[a.title, b.title].filter(Boolean).join(' ↔ ') || 'profiles pending'}</small>
                  </span>
                  <span className="intro__match">{Math.round(p.weight * 100)}%</span>
                  <Button variant="outline" size="sm" onClick={() => copyIntro(p)}>Copy intro</Button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {presenting && <Present event={event} url={url} count={event.members.length} onClose={() => setPresenting(false)} />}
    </div>
  )
}
