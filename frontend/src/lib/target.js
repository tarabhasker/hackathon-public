// Find the Target helpers shared by the network search and the target page.

const ROLE_WORDS = [
  'head of [a-z&]+', // "Head of Procurement": the function belongs to the role
  'managing director', 'general manager', 'country manager', 'vice president',
  'chief executive officer', 'chief financial officer', 'chief technology officer', 'chief operating officer',
  'chairman', 'chairperson', 'president', 'director', 'ceo', 'cfo', 'cto', 'coo', 'md', 'gm', 'vp',
]
const ROLE_RE = new RegExp(
  `\\b(${ROLE_WORDS.map((w) => w.replace(/ /g, '\\s+')).join('|')})\\b`,
  'i',
)

// "Intel Managing Director" -> { role: 'Managing Director', company: 'Intel' }
export function splitTargetQuery(query) {
  const q = query.trim().replace(/\s+/g, ' ')
  const m = q.match(ROLE_RE)
  if (!m) return { role: '', company: q }
  const role = m[0].trim()
  const company = (q.slice(0, m.index) + ' ' + q.slice(m.index + m[0].length))
    .replace(/\b(at|of|for|in)\b/gi, ' ')
    .replace(/[,·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { role, company }
}

// True when the text reads like a role at a company, not a skill search
export function looksLikeTarget(query) {
  const { role, company } = splitTargetQuery(query)
  return Boolean(role && company)
}

// Link to the Find the Target page with the form filled in
export function targetLink(query) {
  const { role, company } = splitTargetQuery(query)
  return `/target?${new URLSearchParams({ role, company })}`
}
