import { useState } from 'react'
import { Avatar, Button, Card, Chip, Eyebrow, Icon, Notice } from '../ui'
import PathSteps from './PathSteps'
import PersonRow from './PersonRow'

// Simplified phone layout: ask, see the top match and the path to them.
export default function MobileFind({
  query,
  onQuery,
  scope,
  onScope,
  heading,
  searching,
  error,
  rows,
  network,
  ctaLabel,
  ctaDone,
  onCta,
  onPick,
}) {
  const [showMore, setShowMore] = useState(false)
  const { target, path, byId, evidence } = network
  const hops = path.length - 1
  const others = rows.filter((r) => r.person.id !== target?.id)
  const role = target ? [target.title, target.org_unit].filter(Boolean).join(' · ') : ''

  return (
    <div className="mf">
      <header className="mf-header">
        <div className="mf-header__top">
          <h1>Who can help you?</h1>
          <Avatar label="YOU" size={32} tone="secondary" />
        </div>
        <label htmlFor="mf-q" className="sr-only">Describe what you need</label>
        <div className="mf-searchbox">
          <Icon name="search" />
          <input
            id="mf-q"
            type="text"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Describe what you need…"
            autoComplete="off"
          />
        </div>
        <div className="mf-scopes">
          <Chip selected={scope === 'org'} onClick={() => onScope('org')}>Whole organisation</Chip>
          <Chip selected={scope === 'division'} onClick={() => onScope('division')}>My division</Chip>
        </div>
      </header>

      <div className="mf-body">
        <Eyebrow>{searching ? 'Searching…' : heading}</Eyebrow>
        {error && <Notice>{error}</Notice>}

        {target ? (
          <Card className="mf-match">
            <div className="mf-match__who">
              <Avatar name={target.name} size={44} tone="primary-soft" ring />
              <div className="mf-match__text">
                <span className="mf-match__name">{target.name}</span>
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
              {ctaDone ? 'Draft copied — paste to send' : ctaLabel}
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
                  <PersonRow key={r.person.id} person={r.person} hops={r.hops} onPick={onPick} />
                ))}
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
