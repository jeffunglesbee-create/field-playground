import { createSignal, createResource } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'

const RELAY_BASE = import.meta.env.DEV
  ? ''
  : 'https://field-relay-nba.jeffunglesbee.workers.dev'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

// Reactive date signal — swap to navigate days without a page reload.
export const [currentDate, setCurrentDate] = createSignal(todayStr())

async function fetchAmbient(date) {
  const res = await fetch(`${RELAY_BASE}/analytics/newspaper/${date}`)
  if (!res.ok) throw new Error(`newspaper fetch failed: ${res.status}`)
  return res.json()
}

export const [ambientData, { refetch: refetchAmbient }] = createResource(currentDate, fetchAmbient)

// --- Live reconciliation experiment (docs/EXPERIMENT-live-reconciliation.md) ---
//
// A plain createResource re-fetch is NOT enough for polling: fetch() returns
// a brand-new array of brand-new objects every call, and SolidJS's <For>
// keys by reference by default -- confirmed via SolidJS's own docs and core
// discussion (github.com/solidjs/solid/discussions/366): updating one field
// on one row via a naive array clone "will re-render that whole row...
// recreating all the DOM nodes." Polling on a plain resource would hit this
// on every single game, every poll cycle -- not fine-grained, not free.
//
// The fix is the documented pattern for exactly this case (polled JSON,
// merge into fine-grained state): a store, updated via reconcile() inside
// the fetcher. reconcile() diffs incoming data against existing store state
// by "id" and only touches what actually changed -- unaffected games keep
// their existing object identity, so GameRow never remounts for them.
export const [deskStore, setDeskStore] = createStore({
  date: null,
  games: { regular: [], postseason: [] },
  briefs: [],
  series: [],
  standings: [],
})

async function fetchDeskReconciled(date) {
  const res = await fetch(`${RELAY_BASE}/context/date/${date}`)
  if (!res.ok) throw new Error(`context fetch failed: ${res.status}`)
  const json = await res.json()
  setDeskStore(reconcile(json))
  // The resource's own value is just a "did this succeed" signal now --
  // real data lives in deskStore, which is what components should read.
  return true
}

export const [deskData, { refetch: refetchDesk }] = createResource(currentDate, fetchDeskReconciled)

// --- Seasons: real structured standings sources ---
//
// /wc/standings (World Cup) confirmed real but concluded -- final table,
// not an ongoing race, doesn't answer the actual Seasons question. Checked
// field-relay-nba further for anything covering a currently-ongoing sport:
// both MLB and MLS route through real upstream-API proxies, confirmed live
// with genuinely current, in-season data (MLB gamesPlayed:102, lastUpdated
// today; MLS match_day:17) -- not concluded, not sample, real ongoing
// competition state for the first time in this component.
async function fetchWcStandings() {
  const res = await fetch(`${RELAY_BASE}/wc/standings`)
  if (!res.ok) throw new Error(`wc/standings fetch failed: ${res.status}`)
  return res.json()
}

export const [wcStandings] = createResource(fetchWcStandings)

// MLB: relay proxies statsapi.mlb.com directly. leagueId 103=AL, 104=NL.
async function fetchMlbStandings() {
  const res = await fetch(`${RELAY_BASE}/mlb-stats/standings?leagueId=103,104&season=${new Date().getFullYear()}`)
  if (!res.ok) throw new Error(`mlb-stats/standings fetch failed: ${res.status}`)
  return res.json()
}

export const [mlbStandings] = createResource(fetchMlbStandings)

// MLS: relay proxies stats-api.mlssoccer.com. Real IDs confirmed live,
// same ones referenced elsewhere in this project's memory
// (MLS_SEASON_2026='MLS-SEA-0001KA').
async function fetchMlsStandings() {
  const res = await fetch(`${RELAY_BASE}/mls/stats/competitions/MLS-COM-000001/seasons/MLS-SEA-0001KA/standings`)
  if (!res.ok) throw new Error(`mls/stats standings fetch failed: ${res.status}`)
  return res.json()
}

export const [mlsStandings] = createResource(fetchMlsStandings)
