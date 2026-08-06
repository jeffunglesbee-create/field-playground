// Re-export surface for the anomaly probes and the offline invariant checker.
//
// Exists so they execute the REAL shipped analysis rather than a copy. esbuild
// bundles from here, resolving the app's extensionless imports and stubbing the
// Solid component module that dramaArcAnalysis pulls dramaTier from. Nothing is
// redefined -- this file only re-exports.
export {
  buildBaselines, describeSlate, describeAnomaly, normalizeSport, gameKey,
  isUnscoredSport, UNSCORED_SPORTS, MIN_DISTINCT_FOR_PERCENTILE, MIN_GAMES_FOR_BASELINE,
  quantile, looQuantile, looPercentileRank,
} from '../../src/data/anomalyBaseline'
