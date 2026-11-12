import { useCallback, useEffect, useRef, useState } from 'react'

// [copied, copy(text)] — `copied` is true for a moment after a successful copy.
export function useCopied(resetMs = 1800) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = useCallback(
    async (text) => {
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        return false // clipboard blocked: leave the label unchanged
      }
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), resetMs)
      return true
    },
    [resetMs],
  )

  return [copied, copy]
}
