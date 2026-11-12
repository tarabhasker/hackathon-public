import { Avatar } from '../ui'

// Vertical "You → … → target" chain with the reason for each link.
export default function PathSteps({ path, byId, evidence }) {
  return (
    <ol className="nw-steps">
      {path.map((id, i) => {
        const person = byId[id]
        const isYou = i === 0
        const isTarget = i === path.length - 1
        return (
          <li key={id}>
            {i > 0 && (
              <div className="nw-steps__link">
                <span className="nw-steps__line" aria-hidden="true" />
                <span className="nw-steps__why">{evidence(path[i - 1], id)}</span>
              </div>
            )}
            <div className="nw-steps__person">
              <Avatar
                name={person.name}
                label={isYou ? 'YOU' : undefined}
                size={28}
                tone={isYou ? 'secondary' : isTarget ? 'primary-soft' : 'neutral'}
              />
              <span className="nw-steps__name">
                {isYou ? 'You' : person.name}
                {!isYou && !isTarget && person.title && (
                  <span className="nw-steps__role"> · {person.title}</span>
                )}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
