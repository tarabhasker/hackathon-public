import { useEffect, useRef } from 'react'
import { Eyebrow, Icon } from '../ui'
import PersonRow from './PersonRow'

// Search box + result list. `rows` is [{person, hops}].
export default function SearchPanel({ query, onQuery, rows, heading, searching, error, activeId, onPick }) {
  const inputRef = useRef(null)

  // ⌘K / Ctrl+K jumps to the search box
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <section className="nw-search">
      <Eyebrow>Search network</Eyebrow>
      <label htmlFor="nw-q" className="sr-only">Describe the help you need</label>
      <div className="nw-searchbox">
        <Icon name="search" size={17} strokeWidth={1.9} />
        <input
          id="nw-q"
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Skills, topics, people…"
          autoComplete="off"
        />
        <kbd>⌘K</kbd>
      </div>

      <div className="nw-results">
        <div className="nw-results__heading">{searching ? 'Searching…' : heading}</div>
        {rows.map((row) => (
          <PersonRow
            key={row.person.id}
            person={row.person}
            hops={row.hops}
            active={row.person.id === activeId}
            onPick={onPick}
          />
        ))}
        {rows.length === 0 && !searching && (
          <div className="nw-results__empty">
            {error || (query.trim() ? 'No one matches yet. Try a skill or team name.' : 'No suggestions yet.')}
          </div>
        )}
      </div>
    </section>
  )
}
