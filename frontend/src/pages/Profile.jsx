import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, assetUrl } from '../api'
import IntroDialog from '../components/network/IntroDialog'
import PathSteps from '../components/network/PathSteps'
import ProfileEditForm from '../components/profile/ProfileEditForm'
import { Avatar, Button, Card, Icon, Notice, useToast } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { ctaLabel, ordinal } from '../lib/network'

function Section({ title, icon, tone = 'surface', children }) {
  return (
    <Card as="section" tone={tone} className="pf-section">
      <h2 className="pf-section__title">
        <span className="pf-section__icon"><Icon name={icon} size={15} /></span>
        {title}
      </h2>
      {children}
    </Card>
  )
}

function Tags({ items, empty, variant = 'solid' }) {
  if (items.length === 0) return <p className="pf-empty">{empty}</p>
  return (
    <ul className={`pf-tags pf-tags--${variant}`}>
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  )
}

function Stat({ label, value }) {
  return (
    <div className="pf-stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

// Statement card ("can help with" / "would like help with")
function Statement({ text }) {
  return text ? <p className="pf-quote">{text}</p> : <p className="pf-empty">Nothing listed yet.</p>
}

// A person's profile. /profile shows (and lets you edit) your own;
// /people/:id shows a connection's, with how you're connected to them.
export default function Profile() {
  const { id } = useParams()
  const { user, refresh } = useAuth()
  const toast = useToast()
  const personId = id ? Number(id) : user.person.id
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [introOpen, setIntroOpen] = useState(false)

  useEffect(() => {
    let live = true
    setProfile(null)
    setError(null)
    setEditing(false)
    api(`/api/people/${personId}`)
      .then((data) => live && setProfile(data))
      .catch((err) => live && setError(err.message))
    return () => {
      live = false
    }
  }, [personId])

  // Shape the path for the shared path helpers (ids + lookup + evidence)
  const route = useMemo(() => {
    const steps = profile?.path || []
    const byId = Object.fromEntries(steps.map((s) => [s.id, s]))
    return { ids: steps.map((s) => s.id), byId, evidence: (_, to) => byId[to]?.evidence || 'connected' }
  }, [profile])

  if (error) {
    return (
      <div className="pf">
        <Notice>{error}</Notice>
        <Button variant="outline" to="/"><Icon name="back" size={16} /> Back to network</Button>
      </div>
    )
  }
  if (!profile) return <div className="pf pf--loading" role="status">Loading profile…</div>

  const role = [profile.title, profile.org_unit].filter(Boolean).join(' · ')
  const firstName = profile.name.split(' ')[0]

  const via = profile.hops > 1 ? profile.path[1].name : null
  const connection = profile.is_me ? 'You' : profile.hops > 0 ? `${ordinal(profile.hops)} connection` : 'No warm path yet'

  return (
    <div className="pf-page">
      {introOpen && (
        <IntroDialog path={route.ids} byId={route.byId} target={profile} onClose={() => setIntroOpen(false)} />
      )}
      <div className="pf">
        <Link to="/" className="pf-back"><Icon name="back" size={16} /> Network</Link>

        <Card className="pf-hero">
          <div className="pf-hero__cover" aria-hidden="true">
            <span /><span /><span />
          </div>
          <div className="pf-hero__body">
            <Avatar
              className="pf-hero__avatar"
              name={profile.name}
              src={assetUrl(profile.avatar_url)}
              size={112}
              tone="neutral"
            />
            <div className="pf-hero__text">
              <h1>{profile.name}</h1>
              {role && <span className="pf-hero__role">{role}</span>}
              {profile.linkedin_url && (
                <a className="pf-hero__linkedin" href={profile.linkedin_url} target="_blank" rel="noopener noreferrer">
                  <Icon name="linkedin" size={15} /> LinkedIn profile
                </a>
              )}
            </div>
            <div className="pf-hero__actions">
              {profile.is_me ? (
                !editing && (
                  <Button variant="secondary" onClick={() => setEditing(true)}>
                    <Icon name="pencil" size={16} /> Edit profile
                  </Button>
                )
              ) : (
                <Button variant="primary" onClick={() => setIntroOpen(true)}>
                  <Icon name="linkedin" size={16} />
                  {ctaLabel(route.ids, route.byId)}
                </Button>
              )}
            </div>
          </div>
          <dl className="pf-stats">
            <Stat label="Connection" value={connection} />
            {via && <Stat label="Introduced by" value={via} />}
            <Stat label="Skills" value={profile.skills.length} />
            <Stat label="Projects" value={profile.projects.length} />
          </dl>
        </Card>

        <div className="pf-cols">
          <div className="pf-main">
            {editing ? (
              <Section title="Edit your profile" icon="pencil">
                <ProfileEditForm
                  profile={profile}
                  onCancel={() => setEditing(false)}
                  onAvatar={(avatar_url) => {
                    setProfile((p) => ({ ...p, avatar_url }))
                    refresh() // keeps the sidebar and graph photo in step
                  }}
                  onSaved={(saved) => {
                    setProfile(saved)
                    setEditing(false)
                    refresh()
                    toast.success('Profile saved')
                  }}
                />
              </Section>
            ) : (
              <>
                <Section title={profile.is_me ? 'You can help with' : `${firstName} can help with`} icon="spark">
                  <Statement text={profile.offer} />
                </Section>
                <Section title={profile.is_me ? "You'd like help with" : `${firstName} would like help with`} icon="search">
                  <Statement text={profile.ask} />
                </Section>
                <Section title="Skills" icon="check">
                  <Tags
                    items={profile.skills}
                    empty={profile.is_me ? 'Add skills so people can find you.' : 'No skills listed yet.'}
                  />
                </Section>
              </>
            )}
          </div>

          <aside className="pf-side">
            {!profile.is_me && profile.hops > 0 && (
              <Section title="How you're connected" icon="network">
                <PathSteps path={route.ids} byId={route.byId} evidence={route.evidence} />
              </Section>
            )}
            <Section title="Projects" icon="folder">
              <Tags items={profile.projects} empty="No projects listed yet." variant="outline" />
            </Section>
          </aside>
        </div>
      </div>
    </div>
  )
}
