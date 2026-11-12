import { Avatar, Button } from '../ui'

// Floating summary of the selected person and how to reach them.
export default function PathCard({ target, pathText, ctaLabel, ctaDone, onCta }) {
  return (
    <div className="nw-pathcard" key={target.id}>
      <Avatar name={target.name} size={42} tone="primary" />
      <div className="nw-pathcard__text">
        <span className="nw-pathcard__name">
          {target.name}
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
