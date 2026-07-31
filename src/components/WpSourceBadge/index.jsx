import styles from './WpSourceBadge.module.css'

// Proposal #3 from the WP wow-features thread: label every win-
// probability NUMBER with where it actually came from, not just the
// section it sits in. The CC-CMD's own words: "#3 shouldn't claim
// 'Estimated' is trustworthy until #1 proves it" -- #1 (the
// validation lab) is done and real (docs/outbox/cc-session-2026-07-31-
// wp-estimator-validation-lab.md), so this can now say exactly what it
// proved: regulation-inning MAE 0.0289, extra-innings MAE 0.1375.
// 'estimated' must never carry the same visual weight as 'savant' --
// that's the entire point of a source badge existing at all.
export function WpSourceBadge(props) {
  const isSavant = () => props.source === 'savant'
  return (
    <span
      class={isSavant() ? styles.savant : styles.estimated}
      title={isSavant()
        ? 'Real win probability read directly from Baseball Savant'
        : 'Client-side estimateWinProb model -- validated MAE 0.029 in regulation innings, 0.138 in extra innings, against real held-out Savant data'}
    >
      {isSavant() ? 'SAVANT' : 'ESTIMATED'}
    </span>
  )
}
