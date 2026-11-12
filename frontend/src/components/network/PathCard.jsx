import { Link } from 'react-router-dom'
import { assetUrl } from '../../api'
import { Avatar, Button } from '../ui'

// Floating summary of the selected person and how to reach them.
export default function PathCard({ target, pathText, ctaLabel, ctaDone, onCta }) {
  return (
    <div className="nw-pathcard" key={target.id}>
      <Link to={`/people/${target.id}`} className="nw-pathcard__avatar" aria-label={`View ${target.name}'s profile`}>
        <Avatar name={target.name} src={assetUrl(target.avatar_url)} size={42} tone="primary" />
      </Link>
      <div className="nw-pathcard__text">
        <span className="nw-pathcard__name">
          <Link to={`/people/${target.id}`} title="View profile">{target.name}</Link>
          {target.title && <span className="nw-pathcard__role"> · {target.title}</span>}
        </span>
        <span className="nw-pathcard__path">{pathText}</span>
      </div>
      <Button variant="primary" onClick={onCta}>
        {ctaDone ? 'Draft copied — paste to send' : ctaLabel}
      </Button>
    </div>
  )
}
