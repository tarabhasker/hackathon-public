import { useMemo } from 'react'
import qrcode from 'qrcode-generator'
import { useCopied } from '../../hooks/useCopied'
import { Button, Card } from '../ui'

export function QrCode({ value, size = 148, label }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
      }
    }
    return { path: d, count: n }
  }, [value])

  return (
    <svg
      width={size}
      height={size}
      viewBox={`-1 -1 ${count + 2} ${count + 2}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      <path d={path} fill="var(--secondary)" />
    </svg>
  )
}

// Invite link + QR code pointing at the registration page.
export default function InvitePanel() {
  const link = `${window.location.origin}/register`
  const [copied, copy] = useCopied()

  return (
    <Card as="section" tone="tinted" className="nw-invite">
      <div>
        <h2 className="nw-invite__title">Invite people to join</h2>
        <span className="nw-invite__sub">The more people join, the shorter everyone's paths get.</span>
      </div>
      <div className="nw-invite__qr">
        <QrCode value={link} label="QR code for the invite link" />
      </div>
      <label htmlFor="nw-inv" className="sr-only">Invite link</label>
      <div className="nw-invite__row">
        <input id="nw-inv" type="text" readOnly value={link.replace(/^https?:\/\//, '')} onFocus={(e) => e.target.select()} />
        <Button variant="secondary" onClick={() => copy(link)} style={{ minWidth: 84 }}>
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
    </Card>
  )
}
