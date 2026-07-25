import { createSignal } from 'solid-js'

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

export { outcomes, pickMeta, annotations }
