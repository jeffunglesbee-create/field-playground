import { Show, createMemo } from 'solid-js'
import { ambientData, journalismBrief, qualityReport } from '../../data/relay'
import styles from './Newspaper.module.css'

// Newspaper — the assembled front page. Production's renderNewspaper is
// a COMPOSITION layer over pieces the playground already has separately:
// JournalismBrief (today's prose), BriefArchive (history), QualityReport
// (the confidence signal). No new endpoint, no new data model -- this
// is the first time those three are read together rather than each
// living in its own tab.
//
// truth_is and sport_of_week are AmbientPanel's fields, already
// confirmed real and already rendered there. Reused here rather than
// re-fetched -- ambientData is a shared module-level resource, so
// reading it here does not duplicate the request.

export function Newspaper() {
  const brief = () => journalismBrief()
  const ambient = () => ambientData()
  const quality = () => qualityReport()

  const masthead = createMemo(() => {
    const d = ambient()?.date
    if (!d) return ''
    return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })
  })

  // The one genuinely editorial decision this component makes: lead
  // with the CONTRADICTION when one exists (real tension is the most
  // newspaper-like thing FIELD has), fall back to truth_is, then the
  // plain morning report. Never invents a headline when none exists.
  const leadKind = createMemo(() => {
    if (ambient()?.contradiction) return 'contradiction'
    if (ambient()?.truth_is?.headline) return 'truth_is'
    if (ambient()?.morning_report) return 'morning_report'
    return null
  })

  // A brief's OWN quality standing, cross-referenced against the
  // global quality_report window rather than invented per-brief --
  // /quality/report has no per-brief field, so this is deliberately
  // NOT presented as "this brief's score," only as the surrounding
  // context for the days it covers.
  const qualityContext = createMemo(() => {
    const q = quality()
    if (!q?.summary?.length) return null
    const scores = q.summary.map(s => s.avg_score).filter(v => typeof v === 'number')
    if (!scores.length) return null
    return {
      avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      days: q.days,
    }
  })

  return (
    <div class={styles.root}>
      <header class={styles.masthead}>
        <h2 class={styles.title}>THE FIELD</h2>
        <div class={styles.mastheadRule} />
        <span class={styles.dateline}>{masthead()}</span>
        <Show when={ambient()?.sport_of_week}>
          <span class={styles.sportOfWeek}>{ambient().sport_of_week}</span>
        </Show>
      </header>

      <Show when={brief.error || ambientData.error}>
        <p class={styles.empty}>
          Unable to load: {String(brief.error?.message ?? ambientData.error?.message ?? '')}
        </p>
      </Show>

      <Show when={leadKind() === 'contradiction'}>
        <div class={styles.leadContradiction}>
          <span class={styles.leadKicker}>THE TENSION</span>
          <p class={styles.leadText}>{ambient().contradiction}</p>
        </div>
      </Show>

      <Show when={leadKind() === 'truth_is'}>
        <blockquote class={styles.leadQuote}>{ambient().truth_is.headline}</blockquote>
      </Show>

      <Show when={ambient()?.morning_report}>
        <p class={styles.body}>{ambient().morning_report}</p>
      </Show>

      <Show when={brief()?.brief}>
        <div class={styles.column}>
          <span class={styles.columnLabel}>Today's Brief</span>
          <p class={styles.body}>{brief().brief}</p>
          <Show when={typeof brief().proseScore === 'number'}>
            <span class={styles.byline}>prose score {brief().proseScore}</span>
          </Show>
        </div>
      </Show>

      <Show when={qualityContext()}>
        <footer class={styles.masthead2}>
          <span class={styles.footNote}>
            {qualityContext().days}-day average quality: {qualityContext().avg}
          </span>
        </footer>
      </Show>
    </div>
  )
}
