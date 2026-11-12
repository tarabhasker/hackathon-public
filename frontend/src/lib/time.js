// "just now", "5m ago", "3h ago", "2d ago". The API sends UTC timestamps without a zone suffix.
export function timeAgo(iso) {
  if (!iso) return ''
  const text = String(iso)
  const when = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text}Z`)
  const seconds = Math.max(0, Math.floor((Date.now() - when.getTime()) / 1000))
  if (seconds < 45) return 'just now'
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
