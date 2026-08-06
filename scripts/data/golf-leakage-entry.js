// Re-export surface for probe-golf-zero-leakage.mjs.
//
// Exists so the probe can execute the REAL component predicates instead of a
// copy of them. esbuild bundles from here, resolving the app's extensionless
// imports and stubbing the CSS/JSX that dramaArcAnalysis drags in via
// dramaTier. Nothing is redefined -- this file only re-exports.
export { analyzeGameArc, EARLY_WINDOW_MIN_POINTS } from '../../src/data/dramaArcAnalysis'
export { computeLeverageIndex } from '../../src/data/leverageIndex'
