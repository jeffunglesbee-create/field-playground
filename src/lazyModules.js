import { lazy } from 'solid-js'

// Real code-splitting loaders. This is the production/dev path: genuine
// dynamic import(), genuine separate Vite chunks, which is what the
// lazy()-and-Suspense experiments in this repo actually test.
//
// The artifact build swaps this whole module for lazyModules.artifact.js
// via a resolve.alias in vite.config.artifact.js. That exists because a
// standalone single-file HTML has nowhere to fetch a chunk from -- the
// symptom was a real "Unable to preload CSS for /assets/index-*.css"
// error and a permanently-missing StandingRoom section.
//
// Doing it here, at the module boundary, rather than in a duplicated
// App.artifact.jsx: that duplicate drifted from App.jsx twice in one day
// (first missing an ErrorBoundary fix, then missing five whole
// components). One App.jsx that can't drift from itself is the actual
// fix; the swap surface is this file, which is small enough to keep in
// sync by inspection.

export const StandingRoomLazy = lazy(() =>
  import('./components/StandingRoom').then(m => ({ default: m.StandingRoom }))
)

export const HeavyPanelLazy = lazy(() =>
  import('./components/LazyBoundaryDemo/HeavyPanel')
)
