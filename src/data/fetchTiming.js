import { createSignal } from 'solid-js'

// Real performance measurement of the fetch infrastructure from inside
// the app itself, not synthetic. Every createResource fetcher in
// relay.js calls the same global `fetch` -- wrapping it once here times
// EVERY request without touching each fetcher individually (there are
// eight and counting: ambient, desk, wc/mlb/mls standings, journalism
// brief, day-context, multi-date-trend's top-pick fetch). A per-fetcher
// wrapper would need updating every time a new resource is added; this
// doesn't.
//
// Imported for its side effect only (installs once, guarded) -- relay.js
// imports this before defining any fetcher, so every request from this
// app is timed from the very first one, not just ones issued after some
// later init() call.

const MAX_SAMPLES = 300
const [samples, setSamples] = createSignal([])

let installed = false
function install() {
  if (installed || typeof window === 'undefined' || !window.fetch) return
  installed = true
  const realFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const rawUrl = typeof args[0] === 'string' ? args[0] : (args[0]?.url ?? String(args[0]))
    const start = performance.now()
    try {
      const res = await realFetch(...args)
      recordSample(rawUrl, performance.now() - start, res.status, res.ok)
      return res
    } catch (err) {
      recordSample(rawUrl, performance.now() - start, 0, false)
      throw err
    }
  }
}

function recordSample(rawUrl, durationMs, status, ok) {
  let endpoint = rawUrl
  try {
    const u = new URL(rawUrl, window.location.origin)
    // Normalize date-shaped path segments so /context/date/2026-07-25 and
    // /context/date/2026-07-24 bucket together as one endpoint instead of
    // fragmenting the histogram by calendar day.
    endpoint = u.pathname.replace(/\/\d{4}-\d{2}-\d{2}(?=\/|$)/, '/:date')
  } catch { /* relative or malformed URL -- fall back to the raw string */ }
  setSamples(s => [...s, { endpoint, durationMs: Math.round(durationMs * 10) / 10, status, ok, at: Date.now() }].slice(-MAX_SAMPLES))
}

install()

export { samples }
