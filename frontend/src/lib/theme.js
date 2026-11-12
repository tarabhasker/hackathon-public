// Read a colour from the theme (styles/tokens.css) for places CSS can't reach:
// canvas drawing, chart libraries, SVGs turned into images.
export function themeColor(name, fallback) {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

// A theme colour at partial opacity, e.g. themeAlpha('--hero-accent', 0.5)
export function themeAlpha(name, alpha, fallback) {
  const base = themeColor(name, fallback)
  return `color-mix(in srgb, ${base} ${Math.round(alpha * 100)}%, transparent)`
}
