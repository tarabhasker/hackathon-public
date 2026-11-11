import { useEffect, useState } from 'react'

// In dev the backend runs separately (./run-backend.sh); in production
// the backend serves this app itself, so relative URLs hit the same origin
const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:5001' : ''

function Navbar() {
  return (
    <nav className="navbar navbar-expand-lg site-nav sticky-top">
      <div className="container">
        <a className="navbar-brand" href="#">
          <span className="brand-mark" aria-hidden="true"></span>
          Hackathon
        </a>
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarNav"
          aria-controls="navbarNav"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="navbarNav">
          <ul className="navbar-nav ms-auto align-items-lg-center">
            <li className="nav-item"><a className="nav-link active" href="#">Home</a></li>
            <li className="nav-item"><a className="nav-link" href="#demo">Demo</a></li>
            <li className="nav-item ms-lg-2">
              <a className="nav-cta" href={`${API_BASE}/docs`}>API Docs</a>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  )
}

function Hero({ backendStatus }) {
  const ok = backendStatus === 'ok'
  const offline = backendStatus === 'offline'

  return (
    <header className="hero">
      <div className="hero-orb one" aria-hidden="true"></div>
      <div className="hero-orb two" aria-hidden="true"></div>
      <div className="container">
        <h1>
          Build something
          <br />
          <span className="gradient-text">worth demoing</span>
        </h1>
        <p className="lead">
          React &amp; Bootstrap up front, FastAPI behind, Postgres underneath.
          Wired, migrated, and ready for your idea.
        </p>
        <div>
          <span className="status-row">
            <span className={`status-dot ${ok ? 'ok' : offline ? 'offline' : ''}`}></span>
            {ok ? 'Backend connected' : offline ? 'Backend offline' : 'Checking backend…'}
          </span>
        </div>
        <div className="cta">
          <a href="#demo" className="btn btn-gradient btn-lg">Try the demo</a>
        </div>
      </div>
    </header>
  )
}

function timeAgo(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString + 'Z')) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function ItemsDemo() {
  const [items, setItems] = useState(null) // null = loading
  const [name, setName] = useState('')
  const [removing, setRemoving] = useState(new Set())

  async function loadItems() {
    const res = await fetch(`${API_BASE}/api/items`)
    setItems(await res.json())
  }

  async function addItem(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setName('')
    await fetch(`${API_BASE}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    await loadItems()
  }

  function deleteItem(id) {
    // Play the exit animation, then actually delete
    setRemoving((prev) => new Set(prev).add(id))
    setTimeout(async () => {
      await fetch(`${API_BASE}/api/items/${id}`, { method: 'DELETE' })
      setRemoving((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      await loadItems()
    }, 250)
  }

  useEffect(() => {
    loadItems().catch(() => setItems([]))
  }, [])

  return (
    <section id="demo" className="demo-section">
      <div className="container">
        <div className="demo-card">
          <h2>Items demo</h2>
          <p className="hint">
            Everything below round-trips through FastAPI into Postgres.
          </p>

          <form onSubmit={addItem} className="item-form">
            <input
              type="text"
              placeholder="Type something and press Enter…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="off"
            />
            <button className="btn btn-gradient" type="submit">Add</button>
          </form>

          <ul className="items">
            {items === null ? (
              <li className="loading">Loading…</li>
            ) : items.length === 0 ? (
              <li className="empty">Nothing here yet — add the first item above.</li>
            ) : (
              items.map((item, i) => (
                <li
                  key={item.id}
                  className={`item ${removing.has(item.id) ? 'removing' : ''}`}
                  style={{ animationDelay: `${Math.min(i * 45, 300)}ms` }}
                >
                  <div>
                    <div className="name">{item.name}</div>
                    <div className="when">{timeAgo(item.created_at)}</div>
                  </div>
                  <button className="btn-delete" onClick={() => deleteItem(item.id)}>
                    Delete
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </section>
  )
}

export default function App() {
  const [backendStatus, setBackendStatus] = useState('checking')

  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((res) => res.json())
      .then((data) => setBackendStatus(data.status))
      .catch(() => setBackendStatus('offline'))
  }, [])

  return (
    <>
      <Navbar />
      <Hero backendStatus={backendStatus} />
      <main>
        <ItemsDemo />
      </main>
      <footer className="site-footer">
        <div className="container">&copy; 2026 Hackathon Project</div>
      </footer>
    </>
  )
}
