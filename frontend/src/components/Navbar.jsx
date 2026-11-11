import { Link, NavLink } from 'react-router-dom'
import { API_BASE } from '../api'

export default function Navbar() {
  return (
    <nav className="navbar navbar-expand-lg site-nav sticky-top">
      <div className="container">
        <Link className="navbar-brand" to="/">
          <span className="brand-mark" aria-hidden="true"></span>
          Hackathon
        </Link>
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
            <li className="nav-item">
              <NavLink className="nav-link" to="/" end>Home</NavLink>
            </li>
            <li className="nav-item">
              <NavLink className="nav-link" to="/quiz">Quiz</NavLink>
            </li>
            <li className="nav-item ms-lg-2">
              <a className="nav-cta" href={`${API_BASE}/docs`}>API Docs</a>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  )
}
