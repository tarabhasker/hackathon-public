import { useEffect, useRef } from 'react'
import { api } from '../../api'
import { useAuth } from '../../hooks/useAuth'
import { clearPendingEvent, getPendingEvent } from '../../lib/events'
import { useToast } from '../ui'

// Renders nothing. Whenever someone becomes signed in while an event is waiting
// (they scanned a QR, then signed in or registered), join them to it and say so.
export default function PendingEventJoiner() {
  const { user } = useAuth()
  const toast = useToast()
  const busy = useRef(false)

  useEffect(() => {
    if (!user || busy.current) return
    const pending = getPendingEvent()
    if (!pending) return

    busy.current = true
    api(`/api/events/${pending.code}/join`, { method: 'POST' })
      .then((res) =>
        toast.success(res.already_joined ? `You're already in ${res.event}.` : `You joined ${res.event}.`),
      )
      .catch((err) => toast.error(err.message))
      .finally(() => {
        clearPendingEvent() // success or not, don't retry on every page load
        busy.current = false
      })
  }, [user, toast])

  return null
}
