import { createSignal, createResource, createEffect } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import './fetchTiming' // side effect: installs the fetch-timing wrapper before any fetcher below runs

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

// Raw poll response recording, for ReplayDemo -- capped ring buffer so a
// long session can't leak memory. Records the RAW response, pre-reconcile:
// replay's whole point is re-driving a reactive graph through the actual
// sequence of snapshots that occurred, not a reconstruction built from
// deskStore's already-reconciled current state (which has thrown away
// everything but the latest values).
const MAX_RECORDINGS = 50
export const [pollRecordings, setPollRecordings] = createSignal([])

async function fetchDeskReconciled(date) {
  const res = await fetch(`${RELAY_BASE}/context/date/${date}`)
  if (!res.ok) throw new Error(`context fetch failed: ${res.status}`)
  const json = await res.json()
  setPollRecordings(r => [...r, { at: Date.now(), date, json }].slice(-MAX_RECORDINGS))
  setDeskStore(reconcile(json))
  setDeskLastFetchedAt(Date.now())
  return true
}

export const [deskData, { refetch: refetchDesk }] = createResource(currentDate, fetchDeskReconciled)

// --- Standings: real structured standings sources, shared live by
// StandingRoom, Stats, and (before their 2026-07-26 merge into
// StandingRoom) Seasons and StandingsDrawer separately ---
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
// Fetches the exact same /analytics/newspaper/{date} route ambientData
// already holds -- deliberately a SEPARATE resource+poll loop, not a read
// of ambientData directly, to keep proving what this section always
// proved: two independently-cadenced resources against the same real
// relay endpoint coexist correctly (polling interval managed by the
// consuming component, JournalismBrief, same pattern as deskData's
// interval in App.jsx).
//
// What changed 2026-07-26: the endpoint, from /journalism/brief to
// /analytics/newspaper/{date}.
//
// CORRECTION 2026-07-27: an earlier version of this comment claimed
// /journalism/brief was "confirmed to never have existed." That is
// FALSE. Verified live: it returns HTTP 200 with real journalism prose
// (3M Open, Rays result), and a bogus sibling path
// (/journalism/nonsense-xyz) returns 403 "Path not allowed" -- proving
// it is an allowlisted route, not a catch-all. The original conclusion
// came from grepping field-relay-nba's source for "journalism"/"brief"
// and finding zero hits, which proves only that the literal STRING is
// absent (the route is reached some other way) -- it never proved the
// route was absent. A negative result needs a higher bar than a grep.
//
// The endpoint change is still correct, for the reason that actually
// holds: /journalism/brief takes no date parameter and returns whatever
// the latest brief is, while this resource is driven by currentDate.
// /analytics/newspaper/{date} is date-parameterized and documented in
// field-relay-nba's HANDOFF.md, so date navigation genuinely works.
// What WAS fake: the old vite.config.js mock invented a brief string, a
// cycleId and a proseScore that exist in no real payload -- so this
// component was only ever testing "a resource that polls on its own
// schedule," never real journalism content. Now it's both.
async function fetchJournalismBrief(date) {
  const res = await fetch(`${RELAY_BASE}/analytics/newspaper/${date}`)
  if (!res.ok) throw new Error(`newspaper fetch failed: ${res.status}`)
  return res.json()
}

export const [journalismBrief, { refetch: refetchBrief }] = createResource(currentDate, fetchJournalismBrief)

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

// Editorial picks (AmbientPanel's ranked list, the newspaper's top pick)
// encode their implied winner in a "score" string ("2–1" = away 2, home 1),
// not an explicit side field -- same away-home ordering as DeskCard's own
// `${displayAway()}–${displayHome()}` scoreStr. Confirmed against the mock:
// por-sea has home: Seattle, away: Portland, score: '2–1', and the mock's
// own morning_report says "Portland holding on at Seattle" -- Portland (away)
// won, which only matches if the first number is away's. Shared by
// CompareToRelay and MultiDateTrend -- both independently parsed this before
// it was pulled out here, so keep them pointed at one implementation rather
// than two copies that can silently diverge.
export function impliedSide(scoreStr) {
  const m = String(scoreStr ?? '').match(/(\d+)\D+(\d+)/)
  if (!m) return null
  const [awayNum, homeNum] = [Number(m[1]), Number(m[2])]
  if (homeNum === awayNum) return null
  return homeNum > awayNum ? 'home' : 'away'
}
