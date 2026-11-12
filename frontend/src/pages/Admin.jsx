import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { ConnectionsSplit, JoinsArea, TeamBars } from '../components/admin/Charts'
import { Badge, Button, Card, Eyebrow, Icon, Spinner, useToast } from '../components/ui'
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
  const [members, setMembers] = useState([])

  const load = useCallback(async () => {
    try {
      const [ov, ev, us] = await Promise.all([
        api('/api/admin/overview'),
        api('/api/admin/events'),
        api('/api/admin/users'),
      ])
      setOverview(ov)
      setEvents(ev)
      setMembers(us)
    } catch (err) {
      toast.error(err.message)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  async function togglePremium(member) {
    try {
      const res = await api(`/api/admin/users/${member.id}/toggle-premium`, { method: 'POST' })
      setMembers((list) => list.map((m) => (m.id === member.id ? { ...m, plan: res.plan } : m)))
      toast.success(`${member.email} is now ${res.plan === 'premium' ? 'Premium' : 'on the free plan'}`)
    } catch (err) {
      toast.error(err.message)
    }
  }

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

      <section className="admin-section" style={{ '--d': '120ms' }}>
        <Eyebrow>Find the Target (Premium)</Eyebrow>
        <div className="admin-stats">
          <Stat label="Premium members" value={Number(overview.premium_users)} />
          <Stat label="Target lookups" value={Number(overview.target_lookups)} />
          <Stat label="Coverage gaps" value={Number(overview.coverage_gaps)} sub="targets with no warm path" />
        </div>
        <Card className="admin-tablewrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Plan</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {members
                .filter((m) => !m.is_admin)
                .map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.person_name || <span className="admin-dim">No profile yet</span>}
                      <div className="admin-dim">{m.email}</div>
                    </td>
                    <td>
                      <Badge tone={m.plan === 'premium' ? 'primary' : 'neutral'}>
                        {m.plan === 'premium' ? '★ Premium' : 'Free'}
                      </Badge>
                    </td>
                    <td>
                      <div className="admin-actions">
                        <Button variant="outline" size="sm" onClick={() => togglePremium(m)}>
                          {m.plan === 'premium' ? 'Remove Premium' : 'Make Premium'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      </section>
    </div>
  )
}
