import { useEffect, useRef, useState } from 'react'
import { assetUrl } from '../../api'
import { useCopied } from '../../hooks/useCopied'
import { linkedinLink } from '../../lib/linkedin'
import { draftMessage, firstName } from '../../lib/network'
import { Avatar, Button, Icon } from '../ui'

// The intro request, sent through LinkedIn. Shows who the message goes to (the
// mutual connection for an intro, or the person themselves when you're directly
// connected), lets you edit the draft, then copies it and opens that person on
// LinkedIn so you can paste and send. LinkedIn offers no way for other sites to
// send a message for you, so the last step is yours.
//
// `path` is the ids from you to `target`; `byId` looks people up by id.
export default function IntroDialog({ path, byId, target, need = '', onClose }) {
  const hops = path.length - 1
  const recipient = hops > 1 ? byId[path[1]] : target
  const link = linkedinLink(recipient)
  const [message, setMessage] = useState(() => draftMessage(path, byId, target, need))
  const [copied, copy] = useCopied(4000)
  const [opened, setOpened] = useState(false)
  const box = useRef(null)
  const field = useRef(null)

  useEffect(() => {
    const previous = document.activeElement
    field.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose])

  function send() {
    // Copy first, synchronously, while this page still has focus: opening the
    // new tab takes focus away, and the async clipboard API then refuses to
    // write. Selecting the box and using the classic copy command works in
    // every browser inside a click; the async API is only a fallback.
    let done = false
    try {
      field.current.select()
      done = document.execCommand('copy')
    } catch {
      done = false
    }
    if (!done) copy(message)
    // same click, so the browser doesn't treat it as a pop-up
    window.open(link.url, '_blank', 'noopener,noreferrer')
    setOpened(true)
  }

  const to = firstName(recipient.name)
  const purpose =
    hops > 1
      ? `Ask ${to} to introduce you to ${target.name}`
      : hops === 1
        ? `Message ${to}`
        : `Reach out to ${to}`

  return (
    <div className="intro-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="introdlg" role="dialog" aria-modal="true" aria-labelledby="intro-title" ref={box}>
        <header className="introdlg__head">
          <h2 id="intro-title">{purpose}</h2>
          <button type="button" className="introdlg__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="introdlg__to">
          <Avatar name={recipient.name} src={assetUrl(recipient.avatar_url)} size={40} tone="primary-soft" />
          <div className="introdlg__who">
            <span className="introdlg__name">{recipient.name}</span>
            <span className="introdlg__meta">
              {[recipient.title, recipient.company].filter(Boolean).join(' · ') || 'On your path'}
            </span>
          </div>
          <span className={`introdlg__badge ${link.exact ? '' : 'introdlg__badge--search'}`}>
            <Icon name="linkedin" size={14} />
            {link.exact ? 'LinkedIn profile' : 'No link saved — we\'ll search'}
          </span>
        </div>

        <label className="introdlg__label" htmlFor="intro-message">Your message</label>
        <textarea
          id="intro-message"
          ref={field}
          className="introdlg__message"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />

        <ol className="introdlg__steps">
          <li className={copied || opened ? 'is-done' : ''}>We copy your message and open {link.exact ? `${to}'s profile` : `a search for ${to}`} on LinkedIn.</li>
          <li>Click <b>Message</b> there, paste (⌘V / Ctrl+V) and send.</li>
        </ol>

        <div className="introdlg__actions">
          <Button variant="outline" onClick={() => copy(message)}>
            {copied && !opened ? 'Copied' : 'Copy only'}
          </Button>
          <Button variant="primary" onClick={send} disabled={!message.trim()}>
            <Icon name="linkedin" size={16} />
            {opened ? 'Opened — paste your message there' : `Copy & open ${to} on LinkedIn`}
          </Button>
        </div>
      </div>
    </div>
  )
}
