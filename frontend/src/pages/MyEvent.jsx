import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, assetUrl } from '../api'
import RoomOrbit from '../components/events/RoomOrbit'
import { Avatar, Badge, Button, Card, Chip, Eyebrow, Icon, Notice, Spinner, useToast } from '../components/ui'
import { useCopied } from '../hooks/useCopied'
import { useCountUp } from '../hooks/useCountUp'
import { clearJoinedRoom, joinUrl } from '../lib/events'

const POLL_MS = 5000
const NEW_FOR_MS = 10 * 60 * 1000 // "new" badge sticks for 10 minutes after joining

const longDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

// An event you attended: who's in the room, how they're tied, who you should
// meet, and your own ties among them. Live events refresh as people join;
// ended ones are the record of connections made there.
export default function MyEvent() {
  const { id } = useParams()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [missing, setMissing] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [focusTeam, setFocusTeam] = useState(null)
  const [filter, setFilter] = useState('')
  const [copied, copy] = useCopied()
  const seen = useRef(null) // node ids already shown, to announce newcomers

  const load = useCallback(async () => {
    try {
      const fresh = await api(`/api/my/events/${id}`)
      if (seen.current && fresh.is_open) {
        const newcomers = fresh.nodes.filter((n) => !seen.current.has(n.id))
        if (newcomers.length === 1) toast.info(`${newcomers[0].name} just joined the room.`)
        else if (newcomers.length > 1) toast.info(`${newcomers.length} people just joined the room.`)
      }
      seen.current = new Set(fresh.nodes.map((n) => n.id))
      setData(fresh)
    } catch (err) {
      if (err.status === 404) setMissing(true)
    }
  }, [id, toast])

  useEffect(() => {
    clearJoinedRoom() // the post-signup redirect has done its job
    load()
  }, [load])

  // Live events keep refreshing so newcomers (and new ties) appear
  useEffect(() => {
    if (!data?.is_open) return undefined
    const timer = setInterval(() => {
      if (!document.hidden) load()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [data?.is_open, load])

  const count = useCountUp(data?.nodes.length ?? 0)

  async function connect(person) {
    setBusyId(person.id)
    try {
      const res = await api(`/api/people/${person.id}/connect`, {
        method: 'POST',
        body: { event_id: Number(id) },
      })
      toast.success(
        res.already
          ? `You and ${person.name} were already connected.`
          : `You and ${person.name} are now connected.`,
      )
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function invite() {
    const url = joinUrl(window.location.origin, data.code)
    try {
      if (navigator.share) {
        await navigator.share({ title: data.name, text: `Join ${data.name}`, url })
        return
      }
    } catch (err) {
      if (err.name === 'AbortError') return
    }
    const ok = await copy(url)
    if (ok) toast.success('Invite link copied — send it to anyone.')
  }

  // Derived room state (safe on null data; computed before early returns so
  // hooks always run in the same order)
  const room = useMemo(() => {
    if (!data) return null
    const me = data.me
    const nodeById = Object.fromEntries(data.nodes.map((n) => [n.id, n]))
    const realEdges = data.edges.filter((e) => !e.semantic)
    const myTies = realEdges
      .filter((e) => e.a === me || e.b === me)
      .map((e) => ({ ...e, other: nodeById[e.a === me ? e.b : e.a] }))
      .filter((t) => t.other)
    const tiedIds = new Set(myTies.map((t) => t.other.id))
    // who you should meet: embedding matches with you, strongest first
    const toMeet = data.edges
      .filter((e) => e.semantic && (e.a === me || e.b === me))
      .map((e) => ({ ...e, other: nodeById[e.a === me ? e.b : e.a] }))
      .filter((m) => m.other && !tiedIds.has(m.other.id))
      .sort((x, y) => y.weight - x.weight)
      .slice(0, 5)
    const teams = [...new Set(data.nodes.map((n) => n.org_unit).filter(Boolean))].sort()
    return { me, nodeById, realEdges, myTies, tiedIds, toMeet, teams }
  }, [data])

  if (missing) {
    return (
      <div className="mev">
        <Card className="admin-empty">
          <span>That event doesn't exist, or you weren't part of it.</span>
          <Button to="/" variant="outline">Back to network</Button>
        </Card>
      </div>
    )
  }

  if (!data || !room) {
    return (
      <div className="mev mev--loading" role="status">
        <Spinner size={22} /> Loading event…
      </div>
    )
  }

  const { me, myTies, tiedIds, toMeet, teams, realEdges } = room
  const now = Date.now()
  const isNew = (n) => data.is_open && n.joined_at && now - new Date(n.joined_at).getTime() < NEW_FOR_MS
  const q = filter.trim().toLowerCase()
  const others = data.nodes
    .filter((n) => n.id !== me)
    .filter(
      (n) =>
        !q ||
        n.name.toLowerCase().includes(q) ||
        (n.title || '').toLowerCase().includes(q) ||
        (n.org_unit || '').toLowerCase().includes(q),
    )

  return (
    <div className="mev">
      <Link to="/" className="ev-back">
        <Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} /> Your network
      </Link>

      <header className="mev-head">
        <div>
          <h1>
            {data.name}{' '}
            <Badge tone={data.is_open ? 'primary' : 'neutral'}>{data.is_open ? 'Live' : 'Ended'}</Badge>
          </h1>
          {data.description && <p className="mev-head__desc">{data.description}</p>}
          <p className="mev-head__meta">
            {longDate(data.created_at)} · <b>{count}</b> {data.nodes.length === 1 ? 'person' : 'people'} ·{' '}
            {realEdges.length} connection{realEdges.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="mev-head__actions">
          {data.is_open && <span className="ev-live">Live</span>}
          {data.is_open && data.code && (
            <Button variant="outline" size="sm" onClick={invite}>
              <Icon name="share" size={15} /> {copied ? 'Link copied' : 'Invite someone'}
            </Button>
          )}
        </div>
      </header>

      <div className="mev-grid">
        <Card className="mev-room">
          <div className="mev-room__head">
            <Eyebrow>{data.is_open ? 'In the room right now' : 'Who was there'}</Eyebrow>
            {data.is_open && <span className="mev-room__hint">Updates as people join</span>}
          </div>
          {teams.length > 1 && (
            <div className="mev-teamchips">
              <Chip selected={focusTeam === null} onClick={() => setFocusTeam(null)}>Everyone</Chip>
              {teams.map((t) => (
                <Chip key={t} selected={focusTeam === t} onClick={() => setFocusTeam((p) => (p === t ? null : t))}>
                  {t}
                </Chip>
              ))}
            </div>
          )}
          {data.nodes.length === 0 ? (
            <Notice tone="warn">Nobody has joined yet.</Notice>
          ) : (
            <RoomOrbit
              nodes={data.nodes}
              edges={data.edges}
              meId={me}
              focusTeam={focusTeam}
              isLive={data.is_open}
              onConnect={connect}
              connectingId={busyId}
              isNew={isNew}
            />
          )}
        </Card>

        <div className="mev-side">
          <Card className="mev-ties mev-find">
            <div className="mev-filter">
              <Icon name="search" size={15} strokeWidth={1.9} />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={`Search ${data.nodes.length} ${data.nodes.length === 1 ? 'person' : 'people'} ${data.is_open ? 'in the room' : 'who were there'}…`}
                aria-label="Search attendees"
              />
            </div>
            {q &&
              (others.length === 0 ? (
                <p className="mev-empty">No one here matches that.</p>
              ) : (
                <ul className="mev-peoplelist">
                  {others.slice(0, 8).map((n) => (
                    <li key={n.id} className="mev-person">
                      {n.has_profile ? (
                        <Link to={`/people/${n.id}`} className="mev-person__who">
                          <Avatar name={n.name} src={assetUrl(n.avatar_url)} size={32} tone="neutral" />
                          <span className="mev-tie__text">
                            <span className="mev-tie__name">
                              {n.name}
                              {isNew(n) && <i className="mev-new">new</i>}
                            </span>
                            <span className="mev-tie__why">
                              {[n.title, n.org_unit].filter(Boolean).join(' · ') || 'Profile set up'}
                            </span>
                          </span>
                        </Link>
                      ) : (
                        <span className="mev-person__who">
                          <Avatar name={n.name} size={32} tone="neutral" />
                          <span className="mev-tie__text">
                            <span className="mev-tie__name">
                              {n.name}
                              {isNew(n) && <i className="mev-new">new</i>}
                            </span>
                            <span className="mev-tie__why">Profile pending</span>
                          </span>
                        </span>
                      )}
                      {n.has_profile ? (
                        tiedIds.has(n.id) ? (
                          <Badge tone="primary"><Icon name="check" size={12} /> Connected</Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyId !== null}
                            onClick={() => connect(n)}
                          >
                            {busyId === n.id ? 'Connecting…' : 'Connect'}
                          </Button>
                        )
                      ) : null}
                    </li>
                  ))}
                  {others.length > 8 && (
                    <li className="mev-empty">+{others.length - 8} more — keep typing to narrow it down.</li>
                  )}
                </ul>
              ))}
          </Card>

          {data.is_open && toMeet.length > 0 && (
            <Card className="mev-ties mev-meet">
              <Eyebrow>People you should meet</Eyebrow>
              <span className="mev-meet__sub">Strong expertise matches in the room you haven't connected with yet.</span>
              <ul className="mev-tielist">
                {toMeet.map((m) => (
                  <li key={m.other.id} className="mev-person">
                    <Link to={`/people/${m.other.id}`} className="mev-person__who">
                      <Avatar name={m.other.name} src={assetUrl(m.other.avatar_url)} size={32} tone="primary-soft" />
                      <span className="mev-tie__text">
                        <span className="mev-tie__name">{m.other.name}</span>
                        <span className="mev-tie__why">
                          {[m.other.title, m.other.org_unit].filter(Boolean).join(' · ') || 'Profile set up'}
                        </span>
                      </span>
                    </Link>
                    <span className="mev-meet__match">{Math.round(m.weight * 100)}%</span>
                    <Button variant="outline" size="sm" disabled={busyId !== null} onClick={() => connect(m.other)}>
                      {busyId === m.other.id ? '…' : 'Connect'}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="mev-ties">
            <Eyebrow>{data.is_open ? 'Your ties here' : 'Connections you made'}</Eyebrow>
            {myTies.length === 0 ? (
              <p className="mev-empty">
                {data.is_open
                  ? 'No ties in this room yet — say hello and tap Connect.'
                  : 'You didn’t record any connections at this event.'}
              </p>
            ) : (
              <ul className="mev-tielist">
                {myTies.map((t) => (
                  <li key={t.other.id}>
                    <Link to={`/people/${t.other.id}`} className="mev-tie">
                      <Avatar name={t.other.name} src={assetUrl(t.other.avatar_url)} size={32} tone="primary-soft" />
                      <span className="mev-tie__text">
                        <span className="mev-tie__name">{t.other.name}</span>
                        <span className="mev-tie__why">{t.evidence || t.type}</span>
                      </span>
                      <span className="mev-meet__match">{Math.round(t.weight * 100)}%</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

        </div>
      </div>
    </div>
  )
}
