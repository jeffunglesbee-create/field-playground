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
