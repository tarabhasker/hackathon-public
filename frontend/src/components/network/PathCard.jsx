import { Link } from 'react-router-dom'
import { assetUrl } from '../../api'
import { Avatar, Button, Icon } from '../ui'

// Floating summary of the selected person and how to reach them.
export default function PathCard({ target, pathText, ctaLabel, onCta }) {
  // a Find the Target person has no profile page; their page is the reach report
  const href = target.external ? `/target?id=${target.id}` : `/people/${target.id}`
  return (
    <div className="nw-pathcard" key={target.id}>
      <Link to={href} className="nw-pathcard__avatar" aria-label={`View ${target.name}'s profile`}>
        <Avatar name={target.name} src={assetUrl(target.avatar_url)} size={42} tone="primary" />
      </Link>
      <div className="nw-pathcard__text">
        <span className="nw-pathcard__name">
          <Link to={href} title={target.external ? 'Open the reach report' : 'View profile'}>
            {target.external && '★ '}
            {target.name}
          </Link>
          {target.title && <span className="nw-pathcard__role"> · {target.title}</span>}
        </span>
        <span className="nw-pathcard__path">{pathText}</span>
      </div>
      <Button variant="primary" onClick={onCta}>
        <Icon name="linkedin" size={16} />
        {ctaLabel}
      </Button>
    </div>
  )
}
