// Custom JavaScript — Bootstrap's JS bundle is already loaded before this file
document.addEventListener('DOMContentLoaded', async () => {
  // Quick demo that the Flask backend is reachable
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    console.log('Backend status:', data.status);
  } catch (err) {
    console.warn('Backend not reachable:', err);
  }
});
