import { useCallback, useEffect, useRef, useState } from 'react'

// The async clipboard API only exists in secure contexts (https / localhost).
// Opened via a LAN IP — a phone pointed at the dev box, say — it's undefined,
// so fall back to the old hidden-textarea trick.
async function writeClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // blocked or unavailable: try the legacy path below
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.left = '-9999px'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

// [copied, copy(text)] — `copied` is true for a moment after a successful copy.
export function useCopied(resetMs = 1800) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(
    async (text) => {
      if (!(await writeClipboard(text))) return false
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), resetMs)
      return true
    },
    [resetMs],
  )

  return [copied, copy]
}
