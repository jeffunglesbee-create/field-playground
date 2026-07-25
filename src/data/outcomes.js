import { createSignal, createEffect } from 'solid-js'

const KEY = 'field-pick-outcomes'
const META_KEY = 'field-pick-meta'
const NOTE_KEY = 'field-pick-notes'

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback)) }
  catch { return fallback }
}

const [outcomes, setOutcomesSignal] = createSignal(load(KEY, {}))

// pickMeta: gameId -> { tier, date }. Kept SEPARATE from outcomes
// deliberately -- outcomes' existing shape (bare 'W'|'L'|'P' string per
// gameId) is read directly by PickRow, Agreement, CrossCheck, and
// DeskCard's untrack snapshot. Changing outcomes() itself to return a
// richer object would be a breaking change to all four call sites for
// no real benefit -- a second, parallel map keyed by the same gameId
// gets the new data (tier, needed for tier calibration; date, parsed
// from the gameId's own date prefix) without touching what already
// works.
const [pickMeta, setPickMetaSignal] = createSignal(load(META_KEY, {}))

const [annotations, setAnnotationsSignal] = createSignal(load(NOTE_KEY, {}))

export function setOutcome(gameId, result, tier) {
  const next = { ...outcomes(), [gameId]: result }
  setOutcomesSignal(next)
  localStorage.setItem(KEY, JSON.stringify(next))

  if (tier !== undefined) {
    const dateMatch = gameId.match(/^(\d{4}-\d{2}-\d{2})/)
    const nextMeta = { ...pickMeta(), [gameId]: { tier, date: dateMatch ? dateMatch[1] : null } }
    setPickMetaSignal(nextMeta)
    localStorage.setItem(META_KEY, JSON.stringify(nextMeta))
  }
}

export function clearOutcome(gameId) {
  const next = { ...outcomes() }
  delete next[gameId]
  setOutcomesSignal(next)
  localStorage.setItem(KEY, JSON.stringify(next))
}

export function clearAllOutcomes() {
  setOutcomesSignal({})
  localStorage.setItem(KEY, JSON.stringify({}))
}

export function setAnnotation(gameId, text) {
  const next = { ...annotations() }
  if (text && text.trim()) {
    next[gameId] = text.trim()
  } else {
    delete next[gameId]
  }
  setAnnotationsSignal(next)
  localStorage.setItem(NOTE_KEY, JSON.stringify(next))
}

// --- BroadcastChannel sync: cross-tab outcomes ---
//
// New territory: date sync (relay.js) confirmed that external writes to a
// plain string signal propagate through the reactive graph. This tests the
// same pattern for an OBJECT signal (outcomes) that has multiple derived
// memos downstream (TierCalibration, MultiDayRecord, PickCalendar in
// History). Does a write from another tab re-derive all three correctly?
// Echo prevention: incoming data is JSON-compared against current state
// before writing; if it matches what we already have (our own echo bounced
// back from the other tab) we skip the write and the loop terminates.
const SYNC_CHANNEL = 'field-playground-outcomes'
let syncChannel = null

export function initOutcomesSync() {
  try {
    syncChannel = new BroadcastChannel(SYNC_CHANNEL)
  } catch {
    return // BroadcastChannel unavailable (old browsers, some workers) -- skip
  }

  syncChannel.onmessage = (event) => {
    const d = event?.data
    if (!d) return
    if (d.outcomes && JSON.stringify(d.outcomes) !== JSON.stringify(outcomes())) {
      setOutcomesSignal(d.outcomes)
      localStorage.setItem(KEY, JSON.stringify(d.outcomes))
    }
    if (d.meta && JSON.stringify(d.meta) !== JSON.stringify(pickMeta())) {
      setPickMetaSignal(d.meta)
      localStorage.setItem(META_KEY, JSON.stringify(d.meta))
    }
  }

  createEffect(() => {
    syncChannel?.postMessage({ outcomes: outcomes(), meta: pickMeta() })
  })
}

export { outcomes, pickMeta, annotations }
