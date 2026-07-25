import { createSignal, createResource, createEffect } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'

const RELAY_BASE = import.meta.env.DEV
  ? ''
  : 'https://field-relay-nba.jeffunglesbee.workers.dev'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

// URL-persisted date: read ?d=YYYY-MM-DD once at module init for the
// starting value -- this is a plain read, no reactivity needed for it.
// Falls back to today if absent or malformed. Keeping the URL in sync
// AFTER init (so navigating days updates the address bar, and a shared
// link reproduces the same view) needs createEffect, which wants a real
// reactive root -- that part is wired from App.jsx's onMount, not here.
function initialDateFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search)
    const d = params.get('d')
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  } catch { /* window/location unavailable (SSR, tests) -- fall through */ }
  return todayStr()
}

// Reactive date signal — swap to navigate days without a page reload.
export const [currentDate, setCurrentDate] = createSignal(initialDateFromUrl())

// Call once from a component's onMount (needs a reactive root). Keeps
// the URL's ?d= param in sync with currentDate via replaceState -- not
// pushState, since date-browsing isn't "back button" navigation
// semantically and would otherwise spam browser history on every click.
export function initUrlDateSync() {
  createEffect(() => {
    const date = currentDate()
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('d', date)
      window.history.replaceState({}, '', url)
    } catch { /* best effort */ }
  })
}

// BroadcastChannel: zero server involvement, tests whether a signal
// write triggered from OUTSIDE the component tree (a browser event
// listener, not a click handler inside JSX) still propagates through
// SolidJS's reactive graph cleanly. Two tabs open the same origin, one
// changes the date, the other follows. Guards against an echo loop
// (receiving your own broadcast back) by comparing against the current
// value before writing.
const CHANNEL_NAME = 'field-playground-date-sync'
let dateChannel = null

export function initBroadcastDateSync() {
  try {
    dateChannel = new BroadcastChannel(CHANNEL_NAME)
  } catch {
    return // BroadcastChannel unavailable (very old browsers) -- skip silently
  }
  dateChannel.onmessage = (event) => {
    const incoming = event?.data?.date
    if (incoming && incoming !== currentDate()) {
      setCurrentDate(incoming)
    }
  }
  createEffect(() => {
    const date = currentDate()
    dateChannel?.postMessage({ date })
  })
}

async function fetchAmbient(date) {
  const res = await fetch(`${RELAY_BASE}/analytics/newspaper/${date}`)
  if (!res.ok) throw new Error(`newspaper fetch failed: ${res.status}`)
  return res.json()
}

export const [ambientData, { refetch: refetchAmbient }] = createResource(currentDate, fetchAmbient)

// --- Live reconciliation experiment (docs/EXPERIMENT-live-reconciliation.md) ---
//
// CONFIRMED 2026-07-25 via real DOM node-identity checks in a real browser
// -- see the experiment doc's full resolution chain.
export const [deskStore, setDeskStore] = createStore({
  date: null,
  games: { regular: [], postseason: [] },
  briefs: [],
  series: [],
  standings: [],
})

// Stale indicator: a plain timestamp signal, updated on every successful
// reconcile.
export const [deskLastFetchedAt, setDeskLastFetchedAt] = createSignal(null)

async function fetchDeskReconciled(date) {
  const res = await fetch(`${RELAY_BASE}/context/date/${date}`)
  if (!res.ok) throw new Error(`context fetch failed: ${res.status}`)
  const json = await res.json()
  setDeskStore(reconcile(json))
  setDeskLastFetchedAt(Date.now())
  return true
}

export const [deskData, { refetch: refetchDesk }] = createResource(currentDate, fetchDeskReconciled)

// --- Seasons: real structured standings sources ---
async function fetchWcStandings() {
  const res = await fetch(`${RELAY_BASE}/wc/standings`)
  if (!res.ok) throw new Error(`wc/standings fetch failed: ${res.status}`)
  return res.json()
}

export const [wcStandings] = createResource(fetchWcStandings)

async function fetchMlbStandings() {
  const res = await fetch(`${RELAY_BASE}/mlb-stats/standings?leagueId=103,104&season=${new Date().getFullYear()}`)
  if (!res.ok) throw new Error(`mlb-stats/standings fetch failed: ${res.status}`)
  return res.json()
}

export const [mlbStandings] = createResource(fetchMlbStandings)

async function fetchMlsStandings() {
  const res = await fetch(`${RELAY_BASE}/mls/stats/competitions/MLS-COM-000001/seasons/MLS-SEA-0001KA/standings`)
  if (!res.ok) throw new Error(`mls/stats standings fetch failed: ${res.status}`)
  return res.json()
}

export const [mlsStandings] = createResource(fetchMlsStandings)

// --- Journalism brief: independent polling resource, slower cadence than deskStore ---
//
// Not driven by currentDate — the relay always returns today's brief regardless
// of date param. Polling interval managed by the consuming component (JournalismBrief),
// not here, same pattern as deskData's refetch interval in App.jsx.
async function fetchJournalismBrief() {
  const res = await fetch(`${RELAY_BASE}/journalism/brief`)
  if (!res.ok) throw new Error(`journalism/brief fetch failed: ${res.status}`)
  return res.json()
}

export const [journalismBrief, { refetch: refetchBrief }] = createResource(fetchJournalismBrief)

// --- Day comparison: first non-singleton resource in this repo ---
//
// Every resource above is a single, module-level global instance, driven
// by the one shared `currentDate` signal. Day comparison needs two
// INDEPENDENT views (e.g. yesterday and today) alive simultaneously,
// neither one driven by the shared date-browser signal -- a genuinely
// different shape than anything else here. createDayContext is a
// factory: each call creates its OWN signal + resource pair, closed over
// in the returned object, not exported as a shared module-level binding.
// Tests whether the pattern used everywhere else (module-level singleton)
// actually generalizes, or whether multiple independent instances need
// something structurally different -- it doesn't; createResource itself
// was never actually singleton-only, everything else here just always
// called it exactly once at module scope.
export function createDayContext(initialDate) {
  const [date, setDate] = createSignal(initialDate)
  async function fetchDay(d) {
    const res = await fetch(`${RELAY_BASE}/context/date/${d}`)
    if (!res.ok) throw new Error(`context fetch failed: ${res.status}`)
    return res.json()
  }
  const [data] = createResource(date, fetchDay)
  return { date, setDate, data }
}
