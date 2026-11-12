import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE } from '../api'

export default function Home() {
  const [backendStatus, setBackendStatus] = useState('checking')

  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((res) => res.json())
      .then((data) => setBackendStatus(data.status))
      .catch(() => setBackendStatus('offline'))
  }, [])

  const ok = backendStatus === 'ok'
  const offline = backendStatus === 'offline'

  return (
    <header className="hero">
      <div className="hero-orb one" aria-hidden="true"></div>
      <div className="hero-orb two" aria-hidden="true"></div>
      <div className="container">
        <h1>
          Someone you know
          <br />
          <span className="gradient-text">knows the answer.</span>
        </h1>
        <p className="lead">
          Ask for the help you need in plain language. 6 Degrees finds the right
          person and the warmest path of introductions to reach them — ranked by
          how well people actually know each other, not just hops.
        </p>
        <div>
          <span className="status-row">
            <span className={`status-dot ${ok ? 'ok' : offline ? 'offline' : ''}`}></span>
            {ok ? 'Network online' : offline ? 'Network offline' : 'Connecting…'}
          </span>
        </div>
        <div className="cta">
          <Link to="/search" className="btn btn-gradient btn-lg">Find someone</Link>
          <Link to="/add" className="btn btn-ghost btn-lg ms-2">Join the network</Link>
        </div>
      </div>
    </header>
  )
}
