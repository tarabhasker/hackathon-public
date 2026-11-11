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
          Three questions.
          <br />
          <span className="gradient-text">One destiny.</span>
        </h1>
        <p className="lead">
          Tell us your name, your age and your favourite food — our deeply
          scientific sorting algorithm will reveal who you truly are.
        </p>
        <div>
          <span className="status-row">
            <span className={`status-dot ${ok ? 'ok' : offline ? 'offline' : ''}`}></span>
            {ok ? 'Sorting Hat connected' : offline ? 'Sorting Hat offline' : 'Waking the Sorting Hat…'}
          </span>
        </div>
        <div className="cta">
          <Link to="/quiz" className="btn btn-gradient btn-lg">Take the quiz</Link>
        </div>
      </div>
    </header>
  )
}
