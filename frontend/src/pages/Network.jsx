import { useEffect, useMemo, useState } from 'react'
import InvitePanel from '../components/network/InvitePanel'
import MobileFind from '../components/network/MobileFind'
import NetworkGraph from '../components/network/NetworkGraph'
import PathCard from '../components/network/PathCard'
import SearchPanel from '../components/network/SearchPanel'
import { Button, Icon, Notice } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useCopied } from '../hooks/useCopied'
import { MOBILE_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { useNetwork } from '../hooks/useNetwork'
import { usePeopleSearch } from '../hooks/usePeopleSearch'
import { ctaLabel, describePath, draftMessage } from '../lib/network'

const ZOOM = { min: 0.6, max: 1.6, step: 0.2 }

// Main UI: the signed-in person's network, search and invites.
export default function Network() {
  const me = useAuth().user.person
  const isMobile = useMediaQuery(MOBILE_QUERY)
  const network = useNetwork()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('org') // 'org' | 'division' (mobile filter)
  const [zoom, setZoom] = useState(1)
  const search = usePeopleSearch(query, { limit: 20 })
  const [ctaDone, copyDraft] = useCopied(2600)

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
  const cta = target ? ctaLabel(path, byId) : ''
  const onCta = () => copyDraft(draftMessage(path, byId, target, query.trim()))
  const heading = search.results ? 'Best matches' : 'Suggested for you'

  if (isMobile) {
    return (
      <MobileFind
        query={query}
        onQuery={setQuery}
        scope={scope}
        onScope={setScope}
        heading={search.results ? 'Top match' : 'Suggested for you'}
        searching={search.searching}
        error={search.error || network.error}
        rows={rows}
        network={network}
        ctaLabel={cta}
        ctaDone={ctaDone}
        onCta={onCta}
        onPick={select}
      />
    )
  }

  const alone = !network.loading && network.nodes.length <= 1

  return (
    <div className="nw">
      <section className="nw-main">
        <div className="nw-head">
          <div>
            <h1>Your network</h1>
            <span>People within 2 hops of you. Click anyone to see the strongest path.</span>
          </div>
          <div className="nw-zoom">
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

        <div className="nw-canvas">
          {network.error ? (
            <Notice>{network.error}</Notice>
          ) : network.loading ? (
            <span className="nw-canvas__status" role="status">Loading your network…</span>
          ) : (
            <NetworkGraph nodes={network.nodes} edges={network.edges} path={path} onSelect={select} zoom={zoom} />
          )}

          <div className="nw-legend">
            <span><i className="nw-legend__path" />Your path</span>
            <span><i className="nw-legend__strong" />Strong tie</span>
            <span><i className="nw-legend__weak" />Weak tie</span>
          </div>

          {target ? (
            <PathCard
              target={target}
              pathText={describePath(path, byId, evidence)}
              ctaLabel={cta}
              ctaDone={ctaDone}
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
        />
        
      </aside>
    </div>
  )
}
