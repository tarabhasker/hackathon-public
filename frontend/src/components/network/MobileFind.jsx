import { useState } from 'react'
import { Link } from 'react-router-dom'
import { assetUrl } from '../../api'
import { useAuth } from '../../hooks/useAuth'
import { MAX_DEGREES } from '../../hooks/useNetwork'
import { Avatar, Button, Card, Eyebrow, Icon, Notice } from '../ui'
import NetworkGraph from './NetworkGraph'
import PathSteps from './PathSteps'
import PersonRow from './PersonRow'

// Simplified phone layout: ask, see the top match and the path to them.
export default function MobileFind({
  query,
  onQuery,
  heading,
  searching,
  error,
  rows,
  network,
  ctaLabel,
  onCta,
  onPick,
  onConnect,
  connectingId,
  connectedIds,
  children,
}) {
  const [showMore, setShowMore] = useState(false)
  const me = useAuth().user.person
  const { target, path, byId, evidence } = network
  const hops = path.length - 1
  const others = rows.filter((r) => r.person.id !== target?.id)
  const role = target ? [target.title, target.org_unit].filter(Boolean).join(' · ') : ''

  return (
    <div className="mf">
      <header className="mf-header">
        <div className="mf-header__top">
          <h1>Who can help you?</h1>
          <Link to="/profile" aria-label="Your profile"><Avatar label="YOU" src={assetUrl(me?.avatar_url)} size={32} tone="secondary" /></Link>
        </div>
      </header>

      {/* stays pinned while the rest scrolls, so search is always at hand */}
      <div className="mf-sticky">
        <label htmlFor="mf-q" className="sr-only">Describe what you need</label>
        <div className="mf-searchbox">
          <Icon name="search" />
          <input
            id="mf-q"
            type="text"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search skills, topics, people…"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="mf-body">
        <section className="mf-map" aria-label="Your network graph">
          <div className="mf-map__head">
            <Eyebrow>Your network</Eyebrow>
            <span className="mf-map__hint">Drag to rotate · tap someone to pick them</span>
          </div>
          <label className="mf-degrees">
            <span className="mf-degrees__label">Degrees</span>
            <input
              type="range"
              min={1}
              max={MAX_DEGREES}
              step={1}
              value={network.degrees}
              onChange={(e) => network.setDegrees(Number(e.target.value))}
              aria-label="Degrees of connection shown"
            />
            <span className="mf-degrees__val">{network.degrees}°</span>
          </label>
          <div className="mf-canvas">
            {network.loading ? (
              <span className="mf-canvas__status" role="status">Loading your network…</span>
            ) : (
              <NetworkGraph
                nodes={network.nodes}
                edges={network.edges}
                path={path}
                onSelect={onPick}
                zoom={1}
                mode="3d"
              />
            )}
          </div>
        </section>

        <Eyebrow>{searching ? 'Searching…' : heading}</Eyebrow>
        {error && <Notice>{error}</Notice>}

        {target ? (
          <Card className="mf-match">
            <div className="mf-match__who">
              <Avatar name={target.name} src={assetUrl(target.avatar_url)} size={44} tone="primary-soft" ring />
              <div className="mf-match__text">
                <Link to={`/people/${target.id}`} className="mf-match__name">{target.name}</Link>
                {role && <span className="mf-match__role">{role}</span>}
              </div>
              <span className="mf-match__hops">
                {hops > 0 ? `${hops} hop${hops === 1 ? '' : 's'}` : 'cold'}
              </span>
            </div>
            {hops > 0 ? (
              <PathSteps path={path} byId={byId} evidence={evidence} />
            ) : (
              <span className="mf-match__role">No warm path yet — this would be cold outreach.</span>
            )}
            <Button variant="primary" size="lg" block onClick={onCta}>
              <Icon name="linkedin" size={16} />
              {ctaLabel}
            </Button>
          </Card>
        ) : (
          !searching && !network.loading && (
            <Card className="mf-empty">
              {query.trim()
                ? 'No one matches yet. Try a skill or team name.'
                : 'No connections yet. Search for a skill, or invite teammates to join.'}
            </Card>
          )
        )}

        {others.length > 0 && (
          <>
            <button
              type="button"
              className="mf-more"
              onClick={() => setShowMore((v) => !v)}
              aria-expanded={showMore}
            >
              <span>{others.length} more match{others.length === 1 ? '' : 'es'}</span>
              <Icon name="chevron" size={16} style={{ transform: showMore ? 'rotate(90deg)' : undefined }} />
            </button>
            {showMore && (
              <Card className="mf-morelist">
                {others.map((r) => (
                  <PersonRow
                    key={r.person.id}
                    person={r.person}
                    hops={r.hops}
                    onPick={onPick}
                    onConnect={onConnect}
                    connecting={connectingId === r.person.id}
                    connected={connectedIds?.has(r.person.id)}
                  />
                ))}
              </Card>
            )}
          </>
        )}

        {children}
      </div>
    </div>
  )
}
