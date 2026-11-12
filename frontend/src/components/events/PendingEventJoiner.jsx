import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { useAuth } from '../../hooks/useAuth'
import { clearPendingEvent, getPendingEvent, setJoinedRoom } from '../../lib/events'
import { useToast } from '../ui'

// Renders nothing. Whenever someone becomes signed in while an event is waiting
// (they scanned a QR, then signed in or registered), join them to it and take
// them into the room — via first-time setup first if they still need a profile.
export default function PendingEventJoiner() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const busy = useRef(false)

  useEffect(() => {
    if (!user || busy.current) return
    const pending = getPendingEvent()
    if (!pending) return

    busy.current = true
    api(`/api/events/${pending.code}/join`, { method: 'POST' })
      .then((res) => {
        toast.success(res.already_joined ? `You're already in ${res.event}.` : `You joined ${res.event}.`)
        if (res.id != null && !user.is_admin) {
          if (user.person) {
            navigate(`/events/${res.id}`, { replace: true })
          } else {
            setJoinedRoom(res.id) // Setup sends them here once their profile exists
          }
        }
      })
      .catch((err) => toast.error(err.message))
      .finally(() => {
        clearPendingEvent() // success or not, don't retry on every page load
        busy.current = false
      })
  }, [user, toast, navigate])

  return null
}
