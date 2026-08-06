// Re-export surface for probe-anomaly-watch-real-corpus.mjs.
//
// Exists so the probe executes the REAL shipped analysis rather than a copy.
// esbuild bundles from here, resolving the app's extensionless imports and
// stubbing the Solid component module that dramaArcAnalysis pulls dramaTier
// from. Nothing is redefined -- this file only re-exports.
export {
  buildBaselines, describeSlate, describeAnomaly, normalizeSport,
  isUnscoredSport, UNSCORED_SPORTS, MIN_DISTINCT_FOR_PERCENTILE, MIN_GAMES_FOR_BASELINE,
} from '../../src/data/anomalyBaseline'
