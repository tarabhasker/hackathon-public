import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import RoomGraph from '../components/admin/RoomGraph'
import { Avatar, Badge, Button, Card, Eyebrow, Icon, Notice, Spinner, useToast } from '../components/ui'

const POLL_MS = 5000

const longDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

// An event you attended: who's in the room, how they're tied, and your own
// ties among them. Live events refresh as people join; ended ones are the
// record of connections made there.
export default function MyEvent() {
  const { id } = useParams()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [missing, setMissing] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/my/events/${id}`))
    } catch (err) {
      if (err.status === 404) setMissing(true)
    }
  }, [id])

  useEffect(() => {
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

  if (!data) {
    return (
      <div className="mev mev--loading" role="status">
        <Spinner size={22} /> Loading event…
      </div>
    )
  }

  const me = data.me
  const nodeById = Object.fromEntries(data.nodes.map((n) => [n.id, n]))
  const realEdges = data.edges.filter((e) => !e.semantic)
  const myTies = realEdges
    .filter((e) => e.a === me || e.b === me)
    .map((e) => ({ ...e, other: nodeById[e.a === me ? e.b : e.a] }))
    .filter((t) => t.other)
  const tiedIds = new Set(myTies.map((t) => t.other.id))
  const others = data.nodes.filter((n) => n.id !== me)

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
            {longDate(data.created_at)} · {data.nodes.length} {data.nodes.length === 1 ? 'person' : 'people'} ·{' '}
            {realEdges.length} connection{realEdges.length === 1 ? '' : 's'}
          </p>
        </div>
        {data.is_open && <span className="ev-live">Live</span>}
      </header>

      <div className="mev-grid">
        <Card className="mev-room">
          <div className="mev-room__head">
            <Eyebrow>{data.is_open ? 'In the room right now' : 'Who was there'}</Eyebrow>
            {data.is_open && (
              <span className="mev-room__hint">Updates as people join</span>
            )}
          </div>
          {data.nodes.length === 0 ? (
            <Notice tone="warn">Nobody has joined yet.</Notice>
          ) : (
            <RoomGraph nodes={data.nodes} edges={data.edges} meId={me} />
          )}
        </Card>

        <div className="mev-side">
          <Card className="mev-ties">
            <Eyebrow>{data.is_open ? 'Your ties here' : 'Connections you made'}</Eyebrow>
            {myTies.length === 0 ? (
              <p className="mev-empty">
                {data.is_open
                  ? 'No ties in this room yet — say hello and tap Connect below.'
                  : 'You didn’t record any connections at this event.'}
              </p>
            ) : (
              <ul className="mev-tielist">
                {myTies.map((t) => (
                  <li key={t.other.id}>
                    <Link to={`/people/${t.other.id}`} className="mev-tie">
                      <Avatar name={t.other.name} size={32} tone="primary-soft" />
                      <span className="mev-tie__text">
                        <span className="mev-tie__name">{t.other.name}</span>
                        <span className="mev-tie__why">{t.evidence || t.type}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="mev-people">
            <Eyebrow>{data.is_open ? 'Everyone here' : 'Attendees'}</Eyebrow>
            {others.length === 0 ? (
              <p className="mev-empty">It's just you so far.</p>
            ) : (
              <ul className="mev-peoplelist">
                {others.map((n) => (
                  <li key={n.id} className="mev-person">
                    {n.has_profile ? (
                      <Link to={`/people/${n.id}`} className="mev-person__who">
                        <Avatar name={n.name} size={32} tone="neutral" />
                        <span className="mev-tie__text">
                          <span className="mev-tie__name">{n.name}</span>
                          <span className="mev-tie__why">
                            {[n.title, n.org_unit].filter(Boolean).join(' · ') || 'Profile set up'}
                          </span>
                        </span>
                      </Link>
                    ) : (
                      <span className="mev-person__who">
                        <Avatar name={n.name} size={32} tone="neutral" />
                        <span className="mev-tie__text">
                          <span className="mev-tie__name">{n.name}</span>
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
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
