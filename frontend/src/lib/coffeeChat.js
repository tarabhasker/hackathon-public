// Coffee Chat helpers: build a pre-filled Google Calendar invite.
// No Google sign-in or API key needed: the link opens Google Calendar's own
// "new event" screen with everything filled in, and the sender hits Save to
// send the invite to the guest.

const GCAL_TEMPLATE = 'https://calendar.google.com/calendar/render'

export function coffeeChatTitle(senderName, recipientName) {
  return `BFF Coffee Chat - ${senderName} x ${recipientName}`
}

// 20261113T020000Z — the UTC format Google Calendar's `dates` param expects
function gcalStamp(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

// "YYYY-MM-DDTHH:mm" in local time, for <input type="datetime-local">
export function toLocalInput(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

// The next weekday (from tomorrow) at `hour`:00 local time
export function nextWeekdaySlot(hour = 10, from = new Date()) {
  const d = new Date(from)
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  d.setHours(hour, 0, 0, 0)
  return d
}

export function coffeeChatUrl({ sender, recipient, start, durationMinutes = 30, eventName, location }) {
  const end = new Date(start.getTime() + durationMinutes * 60_000)
  const met = eventName ? ` after meeting at ${eventName}` : ''
  const details =
    `Hi ${recipient.name.split(/\s+/)[0]}! Great connecting${met} — ` +
    `let's grab a kopi and keep the conversation going.\n\n— ${sender.name} (sent via BFF)`

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: coffeeChatTitle(sender.name, recipient.name),
    dates: `${gcalStamp(start)}/${gcalStamp(end)}`,
    details,
  })
  if (recipient.email) params.set('add', recipient.email)
  if (location) params.set('location', location)
  return `${GCAL_TEMPLATE}?${params}`
}
