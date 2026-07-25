import { lazy } from 'solid-js'
import { Seasons } from './components/Seasons'
import HeavyPanel from './components/LazyBoundaryDemo/HeavyPanel'

// Artifact-build swap target for lazyModules.js, wired via resolve.alias
// in vite.config.artifact.js. Nothing imports this directly.
//
// lazy() only requires a function returning Promise<{default: Component}>
// -- nothing in its contract requires a real dynamic import(). The
// behavior under test in this repo (does Suspense show its fallback,
// does it compose with the skeleton pattern) still holds: lazy() defers
// through a microtask regardless of where the component reference came
// from. What changes is that Vite sees no import() syntax here, so it
// emits no chunk -- which is the whole point, since a standalone
// single-file HTML has nowhere to fetch a chunk from. The real symptom
// this fixes: "Unable to preload CSS for /assets/index-*.css" and a
// permanently-absent Seasons section in the artifact.

export const SeasonsLazy = lazy(() => Promise.resolve({ default: Seasons }))
export const HeavyPanelLazy = lazy(() => Promise.resolve({ default: HeavyPanel }))
