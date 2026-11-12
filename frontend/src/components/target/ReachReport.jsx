import { Link } from 'react-router-dom'
import { assetUrl } from '../../api'
import { useCopied } from '../../hooks/useCopied'
import { firstName } from '../../lib/network'
import { Avatar, Badge, Button, Card, Icon } from '../ui'

const STRENGTH_TONE = { strong: 'primary', moderate: 'neutral', weak: 'warn', you: 'primary' }

export function StrengthBadge({ path }) {
  if (!path) return <Badge>no path</Badge>
  if (path.label === 'you') return <Badge tone="primary">you</Badge>
  return (
    <Badge tone={STRENGTH_TONE[path.label]}>
      {path.label} · {Math.round(path.strength * 1000) / 10}%
    </Badge>
  )
}

// "You → A → B → target" with the evidence for each link; public-data links
// are tagged "inferred" so nobody mistakes a web-found overlap for a real tie.
function HopChain({ path, targetName }) {
  if (!path || path.path.length === 0) return null
  return (
    <ol className="nw-steps ft-chain">
      <li>
        <div className="nw-steps__person">
          <Avatar name="You" label="YOU" size={26} tone="secondary" />
          <span className="nw-steps__name">You</span>
        </div>
      </li>
      {path.path.map((hop, i) => {
        const last = i === path.path.length - 1
        return (
          <li key={`${hop.id}-${i}`}>
            <div className="nw-steps__link">
              <span className="nw-steps__line" aria-hidden="true" />
              <span className="nw-steps__why">
                {hop.edge.evidence || hop.edge.type}
                {hop.edge.inferred && <span className="ft-inferred">inferred</span>}
              </span>
            </div>
            <div className="nw-steps__person">
              <Avatar name={hop.name} size={26} tone={last && hop.name === targetName ? 'primary' : 'neutral'} />
              <span className="nw-steps__name">{hop.name}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function PersonLine({ person, children, linkable = true }) {
  const name = person.external || !linkable ? (
    <span>{person.name}</span>
  ) : (
    <Link to={`/people/${person.id}`}>{person.name}</Link>
  )
  return (
    <div className="ft-person">
      <Avatar name={person.name} src={assetUrl(person.avatar_url)} size={34} />
      <div className="ft-person__text">
        <span className="ft-person__name">
          {name}
          {person.title && <span className="ft-person__role"> · {person.title}</span>}
        </span>
        {children}
      </div>
    </div>
  )
}

function introText(target, path) {
  if (!path || path.path.length === 0) return ''
  if (path.path.length === 1) {
    return `Hi ${firstName(target.name)}, I'd value 15 minutes to introduce myself and hear about your priorities as ${target.title} at ${target.company}. Would you be open to a short call?`
  }
  const via = path.path[0]
  return (
    `Hi ${firstName(via.name)}, I'm hoping to reach ${target.name} (${target.title}, ${target.company}). ` +
    `You look like the best link in our network. Would you be open to introducing us, or pointing me to whoever knows them best?`
  )
}

function CopyButton({ text, label }) {
  const [copied, copy] = useCopied()
  return (
    <Button variant="outline" size="sm" onClick={() => copy(text)} disabled={!text}>
      <Icon name={copied ? 'check' : 'share'} size={14} />
      {copied ? 'Copied' : label}
    </Button>
  )
}

function Rung({ rung, best, children }) {
  const state = rung.rung === best ? 'best' : rung.found ? 'found' : 'empty'
  return (
    <li className={`ft-rung ft-rung--${state}`}>
      <span className="ft-rung__dot" aria-hidden="true">{rung.rung}</span>
      <div className="ft-rung__body">
        <h3 className="ft-rung__title">
          {rung.title}
          {state === 'best' && <Badge tone="primary">best reach</Badge>}
          {state === 'empty' && <span className="ft-rung__none">nothing found</span>}
        </h3>
        {children}
      </div>
    </li>
  )
}

export default function ReachReport({ report, onRefresh }) {
  const { target, rungs, best_rung: best } = report
  const [r1, r2, r3, r4] = rungs
  const firstHop = r1.path?.path[0]

  return (
    <div className="ft-report">
      <Card className="ft-target">
        <Avatar name={target.name} size={52} tone="primary" />
        <div className="ft-target__text">
          <span className="ft-target__name">{target.name}</span>
          <span className="ft-target__role">
            {target.title} · {target.company}
          </span>
          {target.employers.some((e) => !e.current) && (
            <span className="ft-target__career">
              Before:{' '}
              {target.employers
                .filter((e) => !e.current)
                .map((e) => `${e.org}${e.start_year ? ` (${e.start_year}–${e.end_year ?? 'now'})` : ''}`)
                .join(' · ')}
            </span>
          )}
        </div>
        {target.stale && (
          <Button variant="outline" size="sm" onClick={onRefresh}>
            Re-check the web
          </Button>
        )}
      </Card>

      <ol className="ft-ladder">
        <Rung rung={r1} best={best}>
          {r1.path && (
            <>
              <p className="ft-rung__lead">
                <StrengthBadge path={r1.path} /> {r1.path.hops}-hop path to {firstName(target.name)}
              </p>
              <HopChain path={r1.path} targetName={target.name} />
              <div className="ft-actions">
                <CopyButton
                  text={introText(target, r1.path)}
                  label={r1.path.hops === 1 ? 'Copy message' : `Copy intro ask for ${firstName(firstHop.name)}`}
                />
              </div>
            </>
          )}
          {r1.closest.length > 0 && (
            <div className="ft-sub">
              <span className="ft-sub__label">Colleagues closest to {firstName(target.name)}</span>
              {r1.closest.map((c) => (
                <PersonLine key={c.person.id} person={c.person}>
                  <span className="ft-person__meta">
                    <StrengthBadge path={c.to_target} />{' '}
                    {c.to_target.path.length > 1
                      ? `via ${c.to_target.path.slice(0, -1).map((h) => h.name).join(' → ')}`
                      : c.to_target.path[0]?.edge.evidence}
                  </span>
                </PersonLine>
              ))}
            </div>
          )}
        </Rung>

        <Rung rung={r2} best={best}>
          {r2.people.map((c) => (
            <PersonLine key={c.person.id} person={c.person}>
              <span className="ft-person__meta">
                <StrengthBadge path={c.from_you} /> could introduce you from inside
              </span>
            </PersonLine>
          ))}
        </Rung>

        <Rung rung={r3} best={best}>
          {r3.people.map((c) => (
            <PersonLine key={c.person.id} person={c.person} linkable={!c.is_you}>
              <span className="ft-person__meta">
                <StrengthBadge path={c.from_you} /> {c.is_you ? 'You: ' : ''}
                {c.reason}
              </span>
            </PersonLine>
          ))}
        </Rung>

        <Rung rung={r4} best={best}>
          {r4.draft ? (
            <>
              <p className="ft-rung__lead">
                No warm path yet. {target.company} is flagged as a coverage gap for the BD team. A
                prepared first message:
              </p>
              <blockquote className="ft-draft">{r4.draft}</blockquote>
              <div className="ft-actions">
                <CopyButton text={r4.draft} label="Copy message" />
              </div>
            </>
          ) : (
            <p className="ft-rung__lead ft-dim">Not needed: a warmer route exists above.</p>
          )}
        </Rung>
      </ol>

      <Card tone="tinted" className="ft-meta">
        <span>
          Checked <strong>{report.colleagues_checked}</strong> colleagues · found{' '}
          {target.found_at ? new Date(target.found_at).toLocaleDateString() : 'today'}
        </span>
        {report.sources.length > 0 && (
          <details>
            <summary>{report.sources.length} public sources</summary>
            <ul className="ft-sources">
              {report.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer noopener">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
        <span className="ft-dim">
          Links marked “inferred” come from public career history, not from known contact.
        </span>
      </Card>
    </div>
  )
}
