import { useEffect, useState } from 'react'

// The backend runs separately (./run-backend.sh) on this address
const API_BASE = 'http://127.0.0.1:5001'

function Navbar() {
  return (
    <nav className="navbar navbar-expand-lg bg-body-tertiary">
      <div className="container">
        <a className="navbar-brand fw-bold" href="#">Hackathon</a>
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
          <ul className="navbar-nav ms-auto">
            <li className="nav-item"><a className="nav-link active" href="#">Home</a></li>
            <li className="nav-item"><a className="nav-link" href="#demo">Demo</a></li>
            <li className="nav-item">
              <a className="nav-link" href={`${API_BASE}/docs`}>API Docs</a>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  )
}

function Hero({ backendStatus }) {
  const badgeClass =
    backendStatus === 'ok' ? 'bg-success' :
    backendStatus === 'offline' ? 'bg-danger' : 'bg-secondary'

  return (
    <header className="py-5 bg-primary text-white text-center">
      <div className="container py-4">
        <h1 className="display-4 fw-bold">Hackathon Project</h1>
        <p className="lead mb-1">React + Bootstrap frontend · FastAPI backend · SQLite database</p>
        <p className="mb-4">
          Backend status: <span className={`badge ${badgeClass}`}>{backendStatus}</span>
        </p>
        <a href="#demo" className="btn btn-light btn-lg">Try the demo</a>
      </div>
    </header>
  )
}

function ItemsDemo() {
  const [items, setItems] = useState(null) // null = loading
  const [name, setName] = useState('')

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

  async function deleteItem(id) {
    await fetch(`${API_BASE}/api/items/${id}`, { method: 'DELETE' })
    await loadItems()
  }

  useEffect(() => {
    loadItems().catch(() => setItems([]))
  }, [])

  return (
    <section id="demo" className="py-5">
      <div className="container" style={{ maxWidth: 640 }}>
        <h2 className="mb-1">Items demo</h2>
        <p className="text-body-secondary mb-4">
          Everything below goes through the FastAPI backend and is stored in SQLite.
        </p>

        <form onSubmit={addItem} className="input-group mb-3">
          <input
            type="text"
            className="form-control"
            placeholder="New item name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="off"
          />
          <button className="btn btn-primary" type="submit">Add</button>
        </form>

        <ul className="list-group">
          {items === null ? (
            <li className="list-group-item text-body-secondary">Loading…</li>
          ) : items.length === 0 ? (
            <li className="list-group-item text-body-secondary">
              No items yet — add one above.
            </li>
          ) : (
            items.map((item) => (
              <li
                key={item.id}
                className="list-group-item d-flex justify-content-between align-items-center"
              >
                <span>{item.name}</span>
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => deleteItem(item.id)}
                >
                  Delete
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  )
}

export default function App() {
  const [backendStatus, setBackendStatus] = useState('checking…')

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
      <footer className="py-4 bg-body-tertiary">
        <div className="container text-center text-body-secondary">
          <small>&copy; 2026 Hackathon Project</small>
        </div>
      </footer>
    </>
  )
}
