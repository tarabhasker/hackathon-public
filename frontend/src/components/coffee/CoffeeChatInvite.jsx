import { useId, useState } from 'react'
import { api } from '../../api'
import mascot from '../../assets/kopicode-mascot.png'
import { firstName } from '../../lib/network'
import { coffeeChatUrl, nextWeekdaySlot, toLocalInput } from '../../lib/coffeeChat'
import { Button, Card, Icon } from '../ui'

const DURATIONS = [15, 30, 45]

// "Coffee Chat?" card with the Kopicode mascot. It opens a pre-filled Google
// Calendar event named "BFF Coffee Chat - <sender> x <recipient>".
// Reusable: drop it anywhere you have two people.
//
//   sender     {name}                    — usually the signed-in person
//   recipient  {id?, name, email?} | null — null shows `emptyText` instead
//   eventName  optional, e.g. "Hackathon Demo Day", mentioned in the invite
//   location   optional, e.g. "Level 3 pantry"
//   onInvite   optional callback(url) after the calendar opens
export default function CoffeeChatInvite({
  sender,
  recipient,
  eventName,
  location,
  defaultDuration = 30,
  emptyText = 'Connect with someone and the coffee’s on us. Well, the invite is.',
  className = '',
  onInvite,
}) {
  const uid = useId()
  const [when, setWhen] = useState(() => toLocalInput(nextWeekdaySlot()))
  const [duration, setDuration] = useState(defaultDuration)
  // Who we last opened an invite for; picking someone else resets the "sent" state
  const [sentTo, setSentTo] = useState(null)
  const recipientKey = recipient?.id ?? recipient?.name
  const sent = recipient != null && sentTo === recipientKey

  const start = new Date(when)
  const valid = recipient && !Number.isNaN(start.getTime())

  function invite() {
    if (!valid) return
    const url = coffeeChatUrl({ sender, recipient, start, durationMinutes: duration, eventName, location })
    window.open(url, '_blank', 'noopener,noreferrer')
    // record it so the Calendar page knows about this chat; the Google invite
    // is already open, so a failure here shouldn't interrupt anyone
    if (recipient.id != null) {
      api('/api/coffee-chats', {
        method: 'POST',
        body: {
          person_id: recipient.id,
          starts_at: start.toISOString(),
          duration_minutes: duration,
          location: location || null,
          event_name: eventName || null,
        },
      }).catch(() => {})
    }
    setSentTo(recipientKey)
    onInvite?.(url)
  }

  return (
    <Card as="section" tone="tinted" className={`cc ${recipient ? '' : 'cc--idle'} ${className}`}>
      <div className="cc__hero">
        <img className="cc__mascot" src={mascot} alt="Kopicode mascot, a kopi cup waving hello" />
        <div className="cc__bubble" aria-live="polite">
          <span className="cc__ask">{sent ? 'See you there!' : 'Coffee Chat?'}</span>
          {recipient && <span className="cc__with">with {recipient.name}</span>}
        </div>
      </div>

      {!recipient ? (
        <p className="cc__sub">{emptyText}</p>
      ) : (
        <>
          <p className="cc__sub">
            Keep the conversation going{eventName ? ` from ${eventName}` : ''} — invite{' '}
            {firstName(recipient.name)} for a kopi.
          </p>

          <div className="cc__fields">
            <label className="cc__field" htmlFor={`${uid}-when`}>
              <span>When</span>
              <input
                id={`${uid}-when`}
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </label>
            <div className="cc__field" role="group" aria-label="Duration">
              <span>Length</span>
              <div className="cc__durations">
                {DURATIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="cc__duration"
                    aria-pressed={duration === m}
                    onClick={() => setDuration(m)}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button variant="primary" block onClick={invite} disabled={!valid}>
            <Icon name="calendar" size={16} strokeWidth={2} />
            {sent ? 'Open invite again' : 'Send coffee invite'}
          </Button>
          <span className="cc__hint">
            {sent
              ? 'Hit Save in Google Calendar to send it.'
              : recipient.email
                ? `Opens Google Calendar with ${firstName(recipient.name)} added as a guest.`
                : 'Opens Google Calendar. Add their email as a guest before saving.'}
          </span>
        </>
      )}
    </Card>
  )
}
