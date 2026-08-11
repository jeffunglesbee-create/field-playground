import { createSignal, createEffect, untrack } from 'solid-js'
import { parseGameId } from './gameId'

const KEY = 'field-pick-outcomes'
const META_KEY = 'field-pick-meta'
const NOTE_KEY = 'field-pick-notes'
const CONFIDENCE_KEY = 'field-pick-confidence'

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

// confidence: gameId -> integer 0-100, "how sure were you this pick would
// hit" captured AFTER the outcome is known (retroactive, not at pick time --
// see Calibration component). Kept as its own map for the same reason
// pickMeta is separate from outcomes: outcomes' bare W/L/P shape is read
// directly by four existing call sites, and confidence is optional data
// that doesn't exist for picks marked before this feature shipped.
const [confidence, setConfidenceSignal] = createSignal(load(CONFIDENCE_KEY, {}))

// Every write below is wrapped in try/catch -- localStorage.setItem can
// throw for real reasons (Safari private browsing historically threw on
// any access, quota exceeded, storage disabled), and this module is read
// directly by PickRow, Agreement, CrossCheck, and DeskCard's untrack
// snapshot (see the comment above pickMeta), so an uncaught throw here
// would break a real pick-click interaction, not a rare path. Matches
// the established convention already used by every other localStorage
// consumer in this codebase (PickEm, LocalNoteLayer, GameSymphonyArchive,
// teamAffinity.js, myServices.js, beatTheModel.js) -- found by
// scripts/check-localstorage-guards.mjs, 2026-08-03.
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* best effort */ }
}

export function setOutcome(gameId, result, tier) {
  const next = { ...outcomes(), [gameId]: result }
  setOutcomesSignal(next)
  save(KEY, next)

  if (tier !== undefined) {
    // Was an anchored /^(\d{4}-\d{2}-\d{2})/, which stored date: null for
    // every archive-keyed id (sport_date_tail and sport_series_round_date
    // both put the date after the sport). Shared parser now, guarded by
    // scripts/check-gameid-parse.mjs against the real measured ids.
    const nextMeta = { ...pickMeta(), [gameId]: { tier, date: parseGameId(gameId).date } }
    setPickMetaSignal(nextMeta)
    save(META_KEY, nextMeta)
  }
}

export function clearOutcome(gameId) {
  const next = { ...outcomes() }
  delete next[gameId]
  setOutcomesSignal(next)
  save(KEY, next)
}

export function clearAllOutcomes() {
  setOutcomesSignal({})
  save(KEY, {})
}

// WAS the outcome already known when this confidence was stated?
//
// This is the difference between a forecast and a memory, and a Brier score
// computed across both means nothing: rating a game you have already marked W
// is not a prediction, and scoring it against 0.25 ("a coin flip") credits
// skill for reading your own notes. The Calibration component displayed
// exactly that number, under a header asking whether the user's confidence is
// "actually predictive", while rendering the answer beside the slider.
//
// Rather than throw the retrospective ratings away or keep laundering them
// into one figure, record which kind each one is, at write time, when it is
// knowable for free. FORWARD = no outcome existed for this game yet.
//
// Separate map, same reasoning documented for pickMeta and confidence above:
// confidence() is a bare gameId -> int read by existing call sites, and
// widening it would break them for no gain.
//
// Entries stored before this existed have no mode. They are treated as
// RETROSPECTIVE, not forward: every one of them was captured through a UI
// that displayed the result next to the input, so "unknown" here is evidence
// of hindsight, not an absence of evidence.
const MODE_KEY = 'field-pick-confidence-mode'
const [confidenceMode, setConfidenceModeSignal] = createSignal(load(MODE_KEY, {}))

export const FORWARD = 'forward'
export const RETRO = 'retro'

export function confidenceModeFor(gameId) {
  return confidenceMode()[gameId] === FORWARD ? FORWARD : RETRO
}

export function setConfidence(gameId, pct) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)))
  const next = { ...confidence(), [gameId]: clamped }
  setConfidenceSignal(next)
  save(CONFIDENCE_KEY, next)

  // Classified once, at first write, from whether an outcome existed at that
  // moment. Re-rating a game later must NOT promote it to forward -- by then
  // the result is known -- so an existing mode is never overwritten.
  if (confidenceMode()[gameId] === undefined) {
    const knownOutcome = outcomes()[gameId]
    const mode = (knownOutcome === 'W' || knownOutcome === 'L' || knownOutcome === 'P') ? RETRO : FORWARD
    const nextMode = { ...confidenceMode(), [gameId]: mode }
    setConfidenceModeSignal(nextMode)
    save(MODE_KEY, nextMode)
  }
}

export function clearConfidence(gameId) {
  const next = { ...confidence() }
  delete next[gameId]
  setConfidenceSignal(next)
  save(CONFIDENCE_KEY, next)
}

export function setAnnotation(gameId, text) {
  const next = { ...annotations() }
  if (text && text.trim()) {
    next[gameId] = text.trim()
  } else {
    delete next[gameId]
  }
  setAnnotationsSignal(next)
  save(NOTE_KEY, next)
}

// --- myResults: the verdict on YOUR OWN picks ---
//
// THIS IS A SECOND LEDGER ON PURPOSE, AND THE SEPARATION IS THE POINT.
// outcomes() above is the EDITORIAL ledger: FIELD's ambient picks, carrying a
// tier, marked by hand in AmbientPanel. Agreement and CrossCheck read it as
// exactly that -- `editorialVerdict`, `editorialOutcome` -- and compare it
// against the user's own pick from PickEm's `picks` store.
//
// So folding PickEm's results into outcomes() would not unify two halves of
// one thing. It would make Agreement compare a pick against ITS OWN RESULT: a
// tautology reporting 100% agreement, silently, with no error anywhere. That
// was the shape of the change this ledger exists to avoid.
//
// What was genuinely missing is this: PickEm grades a pick by reading the live
// score off deskStore, which only holds the CURRENT date. Change the date and
// the grade is gone -- `picks` persists the pick but nothing ever persisted
// the verdict, so a pick on any past day is unscorable. This records it once,
// when the game finals, from the same derivation PickEm already performs.
//
// NOT SYNCED over BroadcastChannel, unlike the maps above. Those hold typed
// human input that only exists in the tab where it was entered. This is
// derived from (pick, final score) and every tab computes the same value from
// the same inputs, so syncing it would add a write path for no new
// information.
const MY_RESULTS_KEY = 'field-my-pick-results'
const [myResults, setMyResultsSignal] = createSignal(load(MY_RESULTS_KEY, {}))

// Idempotent by construction: returns without writing when the stored value
// already matches. That is what makes it safe to call from a reactive effect
// that also observes this signal -- the second pass is a no-op and the graph
// settles instead of looping.
export function setMyResult(gameId, result) {
  if (result !== 'W' && result !== 'L' && result !== 'P') return
  if (untrack(myResults)[gameId] === result) return
  const next = { ...untrack(myResults), [gameId]: result }
  setMyResultsSignal(next)
  save(MY_RESULTS_KEY, next)
}

export function clearMyResults() {
  setMyResultsSignal({})
  save(MY_RESULTS_KEY, {})
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
      save(KEY, d.outcomes)
    }
    if (d.meta && JSON.stringify(d.meta) !== JSON.stringify(pickMeta())) {
      setPickMetaSignal(d.meta)
      save(META_KEY, d.meta)
    }
    if (d.confidence && JSON.stringify(d.confidence) !== JSON.stringify(confidence())) {
      setConfidenceSignal(d.confidence)
      save(CONFIDENCE_KEY, d.confidence)
    }
  }

  createEffect(() => {
    syncChannel?.postMessage({ outcomes: outcomes(), meta: pickMeta(), confidence: confidence() })
  })
}

export { outcomes, pickMeta, annotations, confidence, myResults }
