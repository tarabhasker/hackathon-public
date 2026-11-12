import { assetUrl } from '../../api'
import { ordinal } from '../../lib/network'
import { Avatar, Badge } from '../ui'

// One selectable person in a list: avatar, name, role and how far away they are.
export default function PersonRow({ person, hops, active = false, onPick }) {
  const role = [person.title, person.org_unit].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      className={`nw-row ${active ? 'nw-row--active' : ''}`}
      onClick={() => onPick(person)}
      aria-pressed={active}
    >
      <Avatar name={person.name} src={assetUrl(person.avatar_url)} size={32} tone={active ? 'primary-soft' : 'neutral'} />
      <span className="nw-row__text">
        <span className="nw-row__name">{person.name}</span>
        {role && <span className="nw-row__role">{role}</span>}
      </span>
      {hops > 0 ? <Badge>{ordinal(hops)}</Badge> : <Badge tone="warn">cold</Badge>}
    </button>
  )
}
