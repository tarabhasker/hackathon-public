import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import AuthLayout from '../components/layout/AuthLayout'
import { Button, Spinner, useToast } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { setPendingEvent } from '../lib/events'

// Where an event's QR code lands. Signed-in people are joined straight away;
// everyone else is sent to sign in / register, and PendingEventJoiner finishes the job.
export default function JoinEvent() {
  const { code } = useParams()
  const { user, loading } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [phase, setPhase] = useState('loading') // loading | ready | closed | joining | invalid | error
  const [message, setMessage] = useState('')
  const started = useRef(false)

  useEffect(() => {
    let live = true
    api(`/api/events/${code}`)
      .then((data) => live && setEvent(data))
      .catch((err) => {
        if (!live) return
        setPhase(err.status === 404 ? 'invalid' : 'error')
        setMessage(err.message)
      })
    return () => {
      live = false
    }
  }, [code])

  useEffect(() => {
    if (!event || loading || started.current) return
    started.current = true

    if (!user) {
      setPendingEvent({ code: event.code, name: event.name })
      setPhase(event.is_open ? 'ready' : 'closed')
      return
    }

    setPhase('joining')
    api(`/api/events/${event.code}/join`, { method: 'POST' })
      .then((res) => {
        toast.success(res.already_joined ? `You're already in ${res.event}.` : `You joined ${res.event}.`)
        navigate(user.is_admin && !user.person ? '/admin' : '/', { replace: true })
      })
      .catch((err) => {
        setPhase(err.status === 403 ? 'closed' : 'error')
        setMessage(err.message)
      })
  }, [event, loading, user, navigate, toast])

  if (phase === 'ready') {
    return (
      <AuthLayout
        title={`Join ${event.name}`}
        subtitle={
          (event.description || 'Create an account or sign in to join this event.') +
          (event.allowed_domains
            ? ` Use your ${event.allowed_domains.split(',').map((d) => '@' + d).join(' or ')} email.`
            : '')
        }
      >
        <div className="form">
          <Button to="/register" variant="primary" size="lg" block>Create an account</Button>
          <Button to="/signin" variant="outline" size="lg" block>I already have an account</Button>
        </div>
      </AuthLayout>
    )
  }

  if (phase === 'closed') {
    return (
      <AuthLayout
        title={event ? `${event.name} is closed` : 'This event is closed'}
        subtitle={message || 'The host has stopped accepting new people. Ask them to reopen it.'}
      >
        <Button to="/" variant="outline" size="lg" block>Go to the app</Button>
      </AuthLayout>
    )
  }

  if (phase === 'invalid') {
    return (
      <AuthLayout title="This link isn't valid" subtitle="Ask the host for a fresh QR code.">
        <Button to="/" variant="outline" size="lg" block>Go to the app</Button>
      </AuthLayout>
    )
  }

  if (phase === 'error') {
    return (
      <AuthLayout title="Couldn't join" subtitle={message || 'Something went wrong.'}>
        <Button to="/" variant="outline" size="lg" block>Go to the app</Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={phase === 'joining' ? `Joining ${event?.name || 'the event'}…` : 'One moment…'}>
      <div className="join-wait" role="status">
        <Spinner size={22} />
      </div>
    </AuthLayout>
  )
}
