// The estimateWinProb function itself, extracted for reuse by the live
// UI. Weights and error figures below are NOT re-derived here -- they
// are the exact output of scripts/wp-estimator-validation-lab.mjs's
// real CI run (WP Estimator Validation Lab, docs/CC-CMD-2026-07-31-wp-
// estimator-validation-lab.md), fit on 22 real MLB games and validated
// against 6 real held-out games never used for fitting:
//   outbox/wp-estimator-validation-lab-2026-07-31T02-00-53-914Z.txt
//   docs/outbox/cc-session-2026-07-31-wp-estimator-validation-lab.md
//
// Regulation innings (1-9) validated at 0.0289 MAE overall (0.016-0.046
// per inning) -- comfortably inside the CC-CMD's own ~0.05-0.08
// "plausibly trustworthy" bar. Extra innings validated at 0.1375 MAE
// (n=7, one held-out sequence) -- a real, confirmed 3-6x jump, not a
// hypothetical one. Any live surface built on this MUST distinguish
// the two, not present a single undifferentiated confidence.
export const WP_ESTIMATOR_WEIGHTS = { w1: 0.3114, w2: 0.7084, w3: 0.1696, b: 0.0893 }
export const WP_ESTIMATOR_MAE_REGULATION = 0.0289
export const WP_ESTIMATOR_MAE_EXTRA_INNINGS = 0.1375

function sigmoid(x) {
  const c = Math.max(-30, Math.min(30, x))
  return 1 / (1 + Math.exp(-c))
}

// Ported verbatim from the validation script -- same clamp at 1.0 for
// extra innings, same (inning-1+half)/9 normalization.
export function periodProgress(inning, halfBottom) {
  const p = (inning - 1 + (halfBottom ? 0.5 : 0)) / 9
  return Math.min(p, 1.0)
}

export function isExtraInnings(inning) {
  return inning > 9
}

export function estimateWinProb({ scoreDiff, periodProgress: p }, weights = WP_ESTIMATOR_WEIGHTS) {
  const { w1, w2, w3, b } = weights
  return sigmoid(w1 * scoreDiff + w2 * scoreDiff * p + w3 * p + b)
}
