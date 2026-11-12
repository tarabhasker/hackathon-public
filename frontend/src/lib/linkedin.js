// Where to reach someone on LinkedIn. With a saved profile link we go straight
// there; without one we fall back to a LinkedIn people search for their name.
export function linkedinLink(person) {
  if (person?.linkedin_url) return { url: person.linkedin_url, exact: true }
  const keywords = [person?.name, person?.company].filter(Boolean).join(' ')
  return {
    url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`,
    exact: false,
  }
}
