import { Link } from 'react-router-dom'
import { assetUrl } from '../../api'
import { ordinal } from '../../lib/network'
import { Avatar, Badge, Icon } from '../ui'

// One person in a result list. Clicking the row focuses them on the graph;
// the trailing actions open their profile or connect with them directly.
export default function PersonRow({ person, hops, active = false, onPick, onConnect, connecting = false, connected: connectedProp = false }) {
  const role = [person.title, person.org_unit].filter(Boolean).join(' · ')
  if (person.external) return <TargetRow person={person} role={role} active={active} onPick={onPick} />
  const connected = connectedProp || hops === 1
  return (
    <div className={`nw-row ${active ? 'nw-row--active' : ''}`}>
      <button
        type="button"
        className="nw-row__main"
        onClick={() => onPick(person)}
        aria-pressed={active}
        aria-label={`Show ${person.name} on the graph`}
      >
        <Avatar name={person.name} src={assetUrl(person.avatar_url)} size={34} tone={active ? 'primary-soft' : 'neutral'} />
        <span className="nw-row__text">
          <span className="nw-row__name">{person.name}</span>
          {role && <span className="nw-row__role">{role}</span>}
        </span>
        {hops > 0 ? <Badge>{ordinal(hops)}</Badge> : <Badge tone="warn">cold</Badge>}
      </button>
      <span className="nw-row__actions">
        <Link
          to={`/people/${person.id}`}
          className="nw-row__iconbtn"
          title="View profile"
          aria-label={`View ${person.name}'s profile`}
        >
          <Icon name="user" size={15} strokeWidth={1.8} />
        </Link>
        {onConnect &&
          (connected ? (
            <span className="nw-row__iconbtn nw-row__iconbtn--done" title="Connected" aria-label={`Connected with ${person.name}`}>
              <Icon name="check" size={15} strokeWidth={2} />
            </span>
          ) : (
            <button
              type="button"
              className="nw-row__iconbtn nw-row__iconbtn--connect"
              disabled={connecting}
              onClick={() => onConnect(person)}
              title="Connect"
              aria-label={`Connect with ${person.name}`}
            >
              <Icon name="plus" size={15} strokeWidth={2} />
            </button>
          ))}
      </span>
    </div>
  )
}

// A Find the Target person: found on the web, so no profile or connect button,
// just their reach report.
function TargetRow({ person, role, active, onPick }) {
  return (
    <div className={`nw-row nw-row--target ${active ? 'nw-row--active' : ''}`}>
      <button
        type="button"
        className="nw-row__main"
        onClick={() => onPick(person)}
        aria-pressed={active}
        aria-label={`Show the route to ${person.name} on the graph`}
      >
        <Avatar name={person.name} size={34} tone="primary" />
        <span className="nw-row__text">
          <span className="nw-row__name">{person.name}</span>
          {role && <span className="nw-row__role">{role}</span>}
        </span>
        <Badge tone="primary">★ Target</Badge>
      </button>
      <span className="nw-row__actions">
        <Link
          to={`/target?id=${person.id}`}
          className="nw-row__iconbtn"
          title="Reach report"
          aria-label={`Open the reach report for ${person.name}`}
        >
          <Icon name="target" size={15} strokeWidth={1.8} />
        </Link>
      </span>
    </div>
  )
}
