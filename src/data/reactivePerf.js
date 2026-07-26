import { createStore } from 'solid-js/store'

// counts[strategy][gameId] = { mounts, computes }. Strategy is either
// 'reconciled' (the real DeskCard shape: stable object identity across
// polls, patched in place) or 'remounted' (a fresh object every poll --
// what DeskCard would cost if it DIDN'T reconcile). Both strategies watch
// the exact same real deskStore data; only the object-identity pattern
// fed to <For> differs. See ReactivePerfPanel for the two <For> lists.

export const [perfCounts, setPerfCounts] = createStore({ reconciled: {}, remounted: {} })

export function bumpPerfCount(strategy, id, kind) {
  setPerfCounts(strategy, id, prev => ({
    mounts: prev?.mounts ?? 0,
    computes: prev?.computes ?? 0,
    [`${kind}s`]: (prev?.[`${kind}s`] ?? 0) + 1,
  }))
}

export function resetPerfCounts() {
  setPerfCounts({ reconciled: {}, remounted: {} })
}
