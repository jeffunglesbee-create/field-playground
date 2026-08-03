import { createSignal } from 'solid-js'

// Local-only running record for the Beat the Model guessing game.
// Deliberately NOT outcomes.js: that module's existing bare W/L/P shape
// is read directly by PickRow, Agreement, CrossCheck, and DeskCard's
// untrack snapshot (its own comment says so) -- a pregame win/loss pick
// domain, not a retrospective drama-tier guess against archived data.
// Conflating the two would be a breaking change to four existing call
// sites for no real benefit. This is single-user, single-browser only:
// window.storage's shared mode does not exist for this session
// (confirmed 2026-08-02, docs/REAL-API-SURFACE.md), so there is no
// cross-viewer leaderboard here -- stated honestly, not implied.
const KEY = 'field-beat-the-model'

function emptyStats() {
  return { total: 0, correct: 0, streak: 0, bestStreak: 0 }
}

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY))
    if (!parsed || typeof parsed.total !== 'number') return emptyStats()
    return { ...emptyStats(), ...parsed }
  } catch {
    return emptyStats()
  }
}

const [stats, setStatsSignal] = createSignal(load())

export function recordGuess(correct) {
  const s = stats()
  const streak = correct ? s.streak + 1 : 0
  const next = {
    total: s.total + 1,
    correct: s.correct + (correct ? 1 : 0),
    streak,
    bestStreak: Math.max(s.bestStreak, streak),
  }
  setStatsSignal(next)
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
}

export function resetStats() {
  const next = emptyStats()
  setStatsSignal(next)
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
}

export { stats }
