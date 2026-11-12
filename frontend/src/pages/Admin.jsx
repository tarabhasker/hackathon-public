import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { ConnectionsSplit, JoinsArea, TeamBars } from '../components/admin/Charts'
import { Button, Card, Eyebrow, Icon, Spinner, useToast } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useCountUp } from '../hooks/useCountUp'

const EDGE_LABELS = {
  project: 'Shared project',
  employer: 'Same employer',
  declared: 'Declared',
  school: 'Same school',
  semantic: 'Similar expertise',
}

function Stat({ label, value, sub }) {
  const counted = useCountUp(value)
  return (
    <Card className="admin-stat">
      <span className="admin-stat__value">{counted.toLocaleString()}</span>
      <span className="admin-stat__label">{label}</span>
      {sub && <span className="admin-stat__sub">{sub}</span>}
    </Card>
  )
}

export default function Admin() {
  const { user } = useAuth()
  const toast = useToast()
  const [overview, setOverview] = useState(null)
  const [events, setEvents] = useState(null)

  const load = useCallback(async () => {
    try {
      const [ov, ev] = await Promise.all([api('/api/admin/overview'), api('/api/admin/events')])
      setOverview(ov)
      setEvents(ev)
    } catch (err) {
      toast.error(err.message)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  if (!overview || !events) {
    return (
      <div className="admin admin--loading" role="status">
        <Spinner size={22} /> Loading admin data…
      </div>
    )
  }

  const joinsThisWeek = overview.joins_by_day.slice(-7).reduce((s, d) => s + Number(d.count), 0)
  const openRooms = events.filter((e) => e.is_open).length

  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <h1>Welcome back</h1>
          <p className="admin-head__sub">Here's how your rooms and the network are doing.</p>
        </div>
        <Button to="/admin/rooms" variant="primary">
          Open a room <Icon name="chevron" size={15} />
        </Button>
      </header>

      <section className="admin-section" style={{ '--d': '0ms' }}>
        <Eyebrow>Overview</Eyebrow>
        <div className="admin-stats">
          <Stat label="Rooms hosted" value={events.length} sub={`${openRooms} open now`} />
          <Stat label="People joined" value={Number(overview.event_joins)} sub={`${joinsThisWeek} in the last 7 days`} />
          <Stat label="People in the network" value={Number(overview.people)} />
          <Stat label="Connections between them" value={Number(overview.edges)} />
        </div>
        <div className="admin-viz">
          <div className="admin-viz__wide">
            <Card className="viz-card viz-card--hero">
              <JoinsArea data={overview.joins_by_day} />
            </Card>
          </div>
          <Card className="viz-card">
            <TeamBars data={overview.people_by_unit} />
          </Card>
          <Card className="viz-card">
            <ConnectionsSplit data={overview.edges_by_type} labels={EDGE_LABELS} />
          </Card>
        </div>
      </section>
    </div>
  )
}
