import { useEffect, useState } from 'react'

// In dev the backend runs separately (./run-backend.sh); in production
// the backend serves this app itself, so relative URLs hit the same origin
const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:5001' : ''

const CONFETTI_COLORS = ['#ae0001', '#d3a625', '#f4d03f', '#e74c3c', '#f8c471']

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
            <li className="nav-item"><a className="nav-link" href="#quiz">Quiz</a></li>
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
          <a href="#quiz" className="btn btn-gradient btn-lg">Take the quiz</a>
        </div>
      </div>
    </header>
  )
}

function LionCrest() {
  return (
    <div className="crest" aria-hidden="true">
      <svg viewBox="0 0 120 140" className="crest-shield">
        <defs>
          <linearGradient id="shieldGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ae0001" />
            <stop offset="100%" stopColor="#7a0000" />
          </linearGradient>
        </defs>
        <path
          d="M60 4 L112 20 V72 C112 104 90 126 60 136 C30 126 8 104 8 72 V20 Z"
          fill="url(#shieldGrad)"
          stroke="#d3a625"
          strokeWidth="5"
        />
      </svg>
      <span className="crest-lion">🦁</span>
    </div>
  )
}

function Confetti() {
  const pieces = Array.from({ length: 36 }, (_, i) => ({
    left: `${(i * 137) % 100}%`,
    delay: `${(i % 12) * 0.12}s`,
    duration: `${2.2 + ((i * 31) % 10) / 6}s`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    spin: i % 2 ? 1 : -1,
  }))
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            left: p.left,
            animationDelay: p.delay,
            animationDuration: p.duration,
            background: p.color,
            '--spin': p.spin,
          }}
        />
      ))}
    </div>
  )
}

function Reveal({ name, entryNumber, onClose }) {
  // Drop your image at frontend/public/surprise.png and it shows here;
  // until then (or if it fails to load) the drawn crest is the fallback
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <Confetti />
      <div className="reveal-card" onClick={(e) => e.stopPropagation()}>
        {imgFailed ? (
          <LionCrest />
        ) : (
          <img
            className="reveal-image"
            src="/surprise.png"
            alt="Your surprise result"
            onError={() => setImgFailed(true)}
          />
        )}
        <p className="reveal-kicker">The results are in, {name}…</p>
        <h3 className="reveal-house">
          You are <span>GRYFFINDOR</span>
        </h3>
        <p className="reveal-sub">
          Daring, nerve and chivalry — plus excellent taste in food.
          You're wizard #{entryNumber} to be sorted.
        </p>
        <button className="btn btn-gradient" onClick={onClose}>
          Sort another wizard
        </button>
      </div>
    </div>
  )
}

function Quiz() {
  const [form, setForm] = useState({ name: '', age: '', food: '' })
  const [phase, setPhase] = useState('idle') // idle | sorting | revealed
  const [entryNumber, setEntryNumber] = useState(null)
  const [error, setError] = useState(null)

  function setField(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function submit(event) {
    event.preventDefault()
    setError(null)
    setPhase('sorting')

    const request = fetch(`${API_BASE}/api/quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        age: Number(form.age),
        favourite_food: form.food,
      }),
    })
    // A little suspense: never reveal before 1.4s
    const suspense = new Promise((resolve) => setTimeout(resolve, 1400))

    try {
      const [res] = await Promise.all([request, suspense])
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || 'Something went wrong')
      }
      const data = await res.json()
      setEntryNumber(data.entry_number)
      setPhase('revealed')
    } catch (err) {
      setError(err.message)
      setPhase('idle')
    }
  }

  function reset() {
    setForm({ name: '', age: '', food: '' })
    setPhase('idle')
  }

  const sorting = phase === 'sorting'

  return (
    <section id="quiz" className="demo-section">
      <div className="container">
        <div className="demo-card">
          <h2>The Sorting Quiz</h2>
          <p className="hint">
            Answer honestly. The algorithm sees everything (and stores it in Postgres).
          </p>

          <form onSubmit={submit} className="quiz-form">
            <label>
              <span>Your name</span>
              <input
                type="text"
                placeholder="e.g. Tara"
                value={form.name}
                onChange={setField('name')}
                required
                autoComplete="off"
                disabled={sorting}
              />
            </label>
            <label>
              <span>Your age</span>
              <input
                type="number"
                min="1"
                max="150"
                placeholder="e.g. 24"
                value={form.age}
                onChange={setField('age')}
                required
                disabled={sorting}
              />
            </label>
            <label>
              <span>Favourite food</span>
              <input
                type="text"
                placeholder="e.g. nasi lemak"
                value={form.food}
                onChange={setField('food')}
                required
                autoComplete="off"
                disabled={sorting}
              />
            </label>

            {error && <p className="quiz-error">{error}</p>}

            <button
              className={`btn btn-gradient btn-submit ${sorting ? 'sorting' : ''}`}
              type="submit"
              disabled={sorting}
            >
              {sorting ? (
                <>
                  <span className="hat-spin" aria-hidden="true">🎩</span> Sorting…
                </>
              ) : (
                'Reveal my house'
              )}
            </button>
          </form>
        </div>
      </div>

      {phase === 'revealed' && (
        <Reveal name={form.name.trim()} entryNumber={entryNumber} onClose={reset} />
      )}
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
        <Quiz />
      </main>
      <footer className="site-footer">
        <div className="container">&copy; 2026 Hackathon Project</div>
      </footer>
    </>
  )
}
