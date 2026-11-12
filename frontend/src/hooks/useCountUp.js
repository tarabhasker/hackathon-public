import { useEffect, useRef, useState } from 'react'

const reduceMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Animates a number towards `target` (ease-out, ~0.7s). Numbers only;
// jumps straight to the value when the user prefers reduced motion.
export function useCountUp(target, duration = 700) {
  const value = Number(target) || 0
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const frame = useRef(null)

  useEffect(() => {
    if (reduceMotion() || from.current === value) {
      from.current = value
      setShown(value)
      return undefined
    }
    const start = performance.now()
    const begin = from.current
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3
      setShown(Math.round(begin + (value - begin) * eased))
      if (t < 1) frame.current = requestAnimationFrame(tick)
      else from.current = value
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [value, duration])

  return shown
}
