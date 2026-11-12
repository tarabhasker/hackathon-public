import { useEffect, useMemo, useState } from 'react'
import CoffeeChatInvite from '../components/coffee/CoffeeChatInvite'
import EventsPanel from '../components/events/EventsPanel'
import IntroDialog from '../components/network/IntroDialog'
import MobileFind from '../components/network/MobileFind'
import NetworkGraph from '../components/network/NetworkGraph'
import PathCard from '../components/network/PathCard'
import SearchPanel from '../components/network/SearchPanel'
import { Button, Icon, Notice, useToast } from '../components/ui'
import { api } from '../api'
import { useAuth } from '../hooks/useAuth'
import { MOBILE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { useNetwork } from '../hooks/useNetwork'
import { usePeopleSearch } from '../hooks/usePeopleSearch'
import { ctaLabel, describePath, firstName, ordinal } from '../lib/network'
import { MAX_DEGREES } from '../hooks/useNetwork'

const ZOOM = { min: 0.6, max: 1.6, step: 0.2 }
const VIEW_KEY = 'bff.networkView'
const VIEWS = [
  { id: '2d', label: '2D' },
  { id: '3d', label: '3D' },
]

function savedView() {
  try {
    const saved = localStorage.getItem(VIEW_KEY)
    return VIEWS.some((v) => v.id === saved) ? saved : '3d'
  } catch {
    return '3d'
  }
}

// Main UI: the signed-in person's network, search and invites.
export default function Network() {
  const me = useAuth().user.person
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const network = useNetwork()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('org') // 'org' | 'division' (mobile filter)
  const [zoom, setZoom] = useState(1)
  const [view, setView] = useState(savedView) // '2d' flat map | '3d' sphere
  const chooseView = (next) => {
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // storage unavailable: the choice lasts for this visit
    }
  }
  const search = usePeopleSearch(query, { limit: 20 })
  const [introOpen, setIntroOpen] = useState(false)
  const toast = useToast()
  const [connectingId, setConnectingId] = useState(null)
  // people connected during this visit, so their rows flip to ✓ at once
  // (search results keep their original hop counts until the next search)
  const [justConnected, setJustConnected] = useState(() => new Set())

  // Connect straight from a result row; the graph refreshes with the new tie
  const connect = async (person) => {
    setConnectingId(person.id)
    try {
      const res = await api(`/api/people/${person.id}/connect`, { method: 'POST', body: {} })
      toast.success(
        res.already
          ? `You and ${person.name} were already connected.`
          : `You and ${person.name} are now connected.`,
      )
      setJustConnected((prev) => new Set(prev).add(person.id))
      network.refresh()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setConnectingId(null)
    }
  }

  // Rows for the result list: search matches, or the closest 2-hop people as suggestions
  const rows = useMemo(() => {
    const inScope = (p) => scope === 'org' || !isMobile || p.org_unit === me.org_unit
    if (search.results) {
      return search.results
        .filter((r) => inScope(r.person))
        .slice(0, 5)
        .map((r) => ({ person: r.person, hops: r.hops }))
    }
    const far = network.nodes.filter((n) => n.depth === 2)
    const pool = far.length > 0 ? far : network.nodes.filter((n) => n.depth === 1)
    return pool.filter(inScope).slice(0, 4).map((n) => ({ person: n, hops: n.depth }))
  }, [search.results, network.nodes, scope, isMobile, me.org_unit])

  // A new set of matches (or a scope change) focuses the best one
  const { select } = network
  useEffect(() => {
    if (search.results && rows[0]) select(rows[0].person)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.results, scope])

  const { target, path, byId, evidence } = network
  // which degrees actually appear, for the legend
  const degreesShown = useMemo(
    () => [...new Set(network.nodes.map((n) => n.depth).filter((d) => d > 0))].sort((a, b) => a - b),
    [network.nodes],
  )
  const cta = target ? ctaLabel(path, byId) : ''
  const onCta = () => setIntroOpen(true)
  const intro = introOpen && target && (
    <IntroDialog path={path} byId={byId} target={target} need={query.trim()} onClose={() => setIntroOpen(false)} />
  )
  const heading = search.results ? 'Best matches' : 'Suggested for you'

  if (isMobile) {
    return (
      <>
      {intro}
      <MobileFind
        query={query}
        onQuery={setQuery}
        heading={search.results ? 'Top match' : 'Suggested for you'}
        searching={search.searching}
        error={search.error || network.error}
        rows={rows}
        network={network}
        ctaLabel={cta}
        onCta={onCta}
        onPick={select}
        onConnect={connect}
        connectingId={connectingId}
        connectedIds={justConnected}
      >
        <EventsPanel />
      </MobileFind>
      </>
    )
  }

  const alone = !network.loading && network.nodes.length <= 1

  return (
    <div className="nw">
      {intro}
      <section className="nw-main">
        <div className="nw-head">
          <div>
            <h1>Your network</h1>
            <span>
              People within {network.degrees} degree{network.degrees === 1 ? '' : 's'} of you.
              Hover anyone for tie strength; click to see the strongest path.
            </span>
          </div>
          <div className="nw-zoom">
            <div className="nw-viewtoggle nw-degrees" role="group" aria-label="Degrees of connection shown">
              {Array.from({ length: MAX_DEGREES }, (_, i) => i + 1).map((d) => (
                <button
                  key={d}
                  type="button"
                  className="nw-viewtoggle__btn nw-viewtoggle__btn--deg"
                  aria-pressed={network.degrees === d}
                  aria-label={`Show ${d} degree${d === 1 ? '' : 's'} of connection`}
                  onClick={() => network.setDegrees(d)}
                >
                  {d}°
                </button>
              ))}
            </div>
            <div className="nw-viewtoggle" role="group" aria-label="Network view">
              {VIEWS.map(({ id: v, label }) => (
                <button
                  key={v}
                  type="button"
                  className="nw-viewtoggle__btn"
                  aria-pressed={view === v}
                  onClick={() => chooseView(v)}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button variant="outline" iconOnly aria-label="Zoom in" disabled={zoom >= ZOOM.max}
              onClick={() => setZoom((z) => Math.min(ZOOM.max, +(z + ZOOM.step).toFixed(1)))}>
              <Icon name="plus" size={16} strokeWidth={2} />
            </Button>
            <Button variant="outline" iconOnly aria-label="Zoom out" disabled={zoom <= ZOOM.min}
              onClick={() => setZoom((z) => Math.max(ZOOM.min, +(z - ZOOM.step).toFixed(1)))}>
              <Icon name="minus" size={16} strokeWidth={2} />
            </Button>
            <Button variant="outline" iconOnly aria-label="Recentre on you" onClick={() => setZoom(1)}>
              <Icon name="target" size={16} strokeWidth={2} />
            </Button>
          </div>
        </div>

        <div className={`nw-canvas nw-canvas--${view}`}>
          {network.error ? (
            <Notice>{network.error}</Notice>
          ) : network.loading ? (
            <span className="nw-canvas__status" role="status">Loading your network…</span>
          ) : (
            <NetworkGraph nodes={network.nodes} edges={network.edges} path={path} onSelect={select} zoom={zoom} mode={view} />
          )}

          <div className="nw-legend">
            {degreesShown.map((d) => (
              <span key={d}>
                <i className="nw-legend__deg" style={{ '--dot': `${Math.max(7, 15 - (d - 1) * 2)}px` }} />
                {ordinal(d)} degree
              </span>
            ))}
            <span className="nw-legend__hint">Thicker line = stronger tie · hover anyone for exact %</span>
          </div>

          {target ? (
            <PathCard
              target={target}
              pathText={describePath(path, byId, evidence)}
              ctaLabel={cta}
                    onCta={onCta}
            />
          ) : (
            alone && (
              <div className="nw-pathcard nw-pathcard--note">
                No connections yet. Search for a skill on the right, or invite teammates —
                shared projects link you up automatically.
              </div>
            )
          )}
        </div>
      </section>

      <aside className="nw-aside">
        <SearchPanel
          query={query}
          onQuery={setQuery}
          rows={rows}
          heading={heading}
          searching={search.searching}
          error={search.error}
          activeId={target?.id}
          onPick={select}
          onConnect={connect}
          connectingId={connectingId}
          connectedIds={justConnected}
        />
        <EventsPanel />
        <CoffeeChatInvite
          sender={me}
          recipient={target?.depth === 1 ? target : null}
          emptyText={
            target
              ? `You and ${firstName(target.name)} aren't connected yet. Coffee chats are for people you've met — pick a 1st-degree connection.`
              : undefined
          }
        />
      </aside>
    </div>
  )
}
