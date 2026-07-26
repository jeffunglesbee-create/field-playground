import { For, Show } from 'solid-js'
import { scoreEvents } from '../../data/scoreEvents'
import styles from './PollDeltaFeed.module.css'

// Every other consumer of deskStore reacts to CURRENT state ("is this
// game live right now"). This derives EVENTS from the sequence of
// snapshots instead ("this game WENT live between poll N and N+1") --
// a first-class transition log, not a re-derivation of the present
// moment. The distinction matters: current-state reactivity throws away
// the fact that a transition happened at all once the next render
// settles; nothing else in this repo remembers "score changed 2-1 to
// 3-1" after the row re-renders with 3-1.
//
// The derivation itself lives in data/scoreEvents.js now, shared with
// ScoreFeed -- this component is a pure presentation of that data, a
// compact log. ScoreFeed presents the identical events as reverse-chron
// cards. Neither owns the diff engine; App.jsx's initScoreEvents() does.

export function PollDeltaFeed() {
  const ordered = () => [...scoreEvents()].reverse()

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Poll Delta Feed</span>
        <span class={styles.sublabel}>events derived from snapshots, not current state</span>
      </header>
      <Show when={scoreEvents().length} fallback={<p class={styles.empty}>No transitions yet — waiting for a second poll cycle to diff against.</p>}>
        <div class={styles.feed}>
          <For each={ordered()}>
            {e => (
              <div class={`${styles.eventRow} ${styles['kind_' + e.kind]}`}>
                <span class={styles.eventTime}>{new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <span class={styles.eventText}>{e.text}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
