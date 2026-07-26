import { For, Show, createMemo } from 'solid-js'
import { deskStore } from '../../data/relay'
import { myTeam, setMyTeam, theirTeam } from '../../data/teamAffinity'
import styles from './TeamAffinitySync.module.css'

// "MY TEAM" and "YOUR TEAM" shown together on production's gamecard are
// two DISTINCT concurrent identities, not one converged value -- the
// merge (data/teamAffinity.js) is a local signal joined with a remote one
// heard over BroadcastChannel, kept deliberately separate here rather
// than reduced into a single "team" value.

function allGames() {
  return [...(deskStore.games?.regular ?? []), ...(deskStore.games?.postseason ?? [])]
}

function gameStatus(g) {
  if (g.home_score === null) return 'pre'
  if (g.finalized_at) return g.went_to_ot ? 'final_ot' : 'final'
  return 'live'
}

function teamsInSlate() {
  const set = new Set()
  for (const g of allGames()) {
    set.add(g.home)
    set.add(g.away)
  }
  return [...set].sort()
}

export function TeamAffinitySync() {
  const games = createMemo(allGames)
  const teams = createMemo(teamsInSlate)

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Team Affinity Sync</span>
        <span class={styles.sublabel}>MY TEAM / YOUR TEAM, merged live across tabs</span>
      </header>
      <p class={styles.note}>
        A local pick (this tab, persisted) merged with a remote one heard over BroadcastChannel from
        another open tab — two independent values shown together, not one converged signal the way
        the shared date sync is. Open a second tab and pick a different team there to see it appear
        as "your team" here.
      </p>

      <div class={styles.pickerRow}>
        <label class={styles.pickerLabel} for="my-team-select">my team</label>
        <select
          id="my-team-select"
          class={styles.select}
          value={myTeam() ?? ''}
          onChange={e => setMyTeam(e.currentTarget.value || null)}
        >
          <option value="">none</option>
          <For each={teams()}>{t => <option value={t}>{t}</option>}</For>
        </select>
      </div>

      <div class={styles.theirRow}>
        <span class={styles.pickerLabel}>your team</span>
        <Show when={theirTeam()} fallback={<span class={styles.theirEmpty}>no other tab has set one yet</span>}>
          <span class={styles.theirValue}>{theirTeam()}</span>
        </Show>
      </div>

      <Show when={games().length} fallback={<p class={styles.empty}>No games today.</p>}>
        <div class={styles.rowList}>
          <For each={games()}>
            {g => {
              const isMine = () => myTeam() && (g.home === myTeam() || g.away === myTeam())
              const isTheirs = () => theirTeam() && (g.home === theirTeam() || g.away === theirTeam())
              return (
                <div class={styles.row}>
                  <span class={`${styles.dot} ${styles[gameStatus(g)]}`} />
                  <span class={styles.matchup}>{g.away} @ {g.home}</span>
                  <Show when={isMine()}><span class={`${styles.chip} ${styles.mine}`}>MY TEAM</span></Show>
                  <Show when={isTheirs()}><span class={`${styles.chip} ${styles.theirs}`}>YOUR TEAM</span></Show>
                </div>
              )
            }}
          </For>
        </div>
      </Show>
    </div>
  )
}
