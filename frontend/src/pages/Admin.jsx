import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { Badge, Button, Card, Eyebrow, Spinner, useToast } from '../components/ui'
import { useAuth } from '../hooks/useAuth'

function Stat({ label, value, sub }) {
  return (
    <Card className="admin-stat">
      <span className="admin-stat__value">{value}</span>
      <span className="admin-stat__label">{label}</span>
      {sub && <span className="admin-stat__sub">{sub}</span>}
    </Card>
  )
}

export default function Admin() {
  const { user } = useAuth()
  const toast = useToast()
  const [overview, setOverview] = useState(null)
  const [users, setUsers] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    try {
      const [ov, us] = await Promise.all([api('/api/admin/overview'), api('/api/admin/users')])
      setOverview(ov)
      setUsers(us)
    } catch (err) {
      toast.error(err.message)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  async function toggleAdmin(u) {
    setBusyId(u.id)
    try {
      const res = await api(`/api/admin/users/${u.id}/toggle-admin`, { method: 'POST' })
      toast.success(`${u.email} is ${res.is_admin ? 'now an admin' : 'no longer an admin'}`)
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function deletePerson(u) {
    if (!window.confirm(`Delete ${u.person_name}'s profile from the network? This removes their edges too.`)) return
    setBusyId(u.id)
    try {
      await api(`/api/admin/people/${u.person_id}`, { method: 'DELETE' })
      toast.success(`${u.person_name} removed from the network`)
      await load()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusyId(null)
    }
  }

  if (!overview || !users) {
    return (
      <div className="admin admin--loading" role="status">
        <Spinner size={22} /> Loading admin data…
      </div>
    )
  }

  const embeddedPct = overview.facets
    ? Math.round((overview.embedded_facets / overview.facets) * 100)
    : 0

  return (
    <div className="admin">
      <header className="admin-head">
        <h1>Admin</h1>
        <span>Signed in as {user.email}</span>
      </header>

      <div className="admin-stats">
        <Stat label="Accounts" value={overview.users} />
        <Stat
          label="People in graph"
          value={overview.people}
          sub={`${overview.real_people} real · ${overview.people - overview.real_people} synthetic`}
        />
        <Stat label="Edges" value={overview.edges.toLocaleString()} />
        <Stat label="Facets embedded" value={`${embeddedPct}%`} sub={`${overview.embedded_facets}/${overview.facets}`} />
        <Stat label="Quiz entries" value={overview.quiz_entries} />
      </div>

      <section>
        <Eyebrow>Accounts</Eyebrow>
        <Card className="admin-tablewrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Profile</th>
                <th>Role</th>
                <th>Created</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.person_name || <span className="admin-dim">no profile yet</span>}</td>
                  <td>{u.is_admin ? <Badge tone="primary">admin</Badge> : <span className="admin-dim">member</span>}</td>
                  <td className="admin-dim">{String(u.created_at).slice(0, 10)}</td>
                  <td className="admin-actions">
                    {u.id !== user.id && (
                      <Button variant="outline" size="sm" disabled={busyId === u.id} onClick={() => toggleAdmin(u)}>
                        {u.is_admin ? 'Remove admin' : 'Make admin'}
                      </Button>
                    )}
                    {u.person_id && (
                      <Button variant="outline" size="sm" disabled={busyId === u.id} onClick={() => deletePerson(u)}>
                        Delete profile
                      </Button>
                    )}
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
