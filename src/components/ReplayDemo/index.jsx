import { For, Show, createSignal, createMemo, onCleanup } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { pollRecordings } from '../../data/relay'
import styles from './ReplayDemo.module.css'

// The data already flows -- relay.js now records every raw poll response
// pre-reconcile. This just captures playback: drive an INDEPENDENT local
// store through that recorded sequence at a chosen speed, never touching
// the shared deskStore. The question this answers: is SolidJS's reactive
// graph tied to the wall clock in any way, or can it be driven equally
// well by synthetic time (a setTimeout scheduled off recorded gaps ×
// 1/speed) as by the real poll interval? It can -- reconcile() doesn't
// know or care whether the store it's updating is fed by a live fetch
// or a scrubber; a write is a write.

const SPEEDS = [1, 4, 10, 30]

export function ReplayDemo() {
  const [replayStore, setReplayStore] = createStore({ games: { regular: [], postseason: [] } })
  const [index, setIndex] = createSignal(-1)
  const [playing, setPlaying] = createSignal(false)
  const [speed, setSpeed] = createSignal(4)
  let timer

  function applyIndex(i) {
    const rec = pollRecordings()[i]
    if (!rec) return
    setReplayStore(reconcile(rec.json))
    setIndex(i)
  }

  function stepAndScheduleNext() {
    const recs = pollRecordings()
    const currentI = index()
    const nextI = currentI + 1
    if (nextI >= recs.length) { setPlaying(false); return }
    // The recorded gap belongs BEFORE the transition it leads into, not
    // after -- applying nextI immediately and scheduling off the gap
    // to nextI+1 (the original code) meant every delay landed one step
    // late: play() applies record 0, then immediately (0ms) jumps to
    // record 1, and only the eventual record 2 waits out any real gap.
    // Recorded timing was being replayed a full step out of phase.
    const gapMs = recs[nextI].at - recs[currentI].at
    timer = setTimeout(() => {
      applyIndex(nextI)
      stepAndScheduleNext()
    }, Math.max(50, gapMs / speed()))
  }

  function play() {
    if (!pollRecordings().length) return
    setPlaying(true)
    if (index() < 0) applyIndex(0)
    stepAndScheduleNext()
  }
  function pause() {
    setPlaying(false)
    clearTimeout(timer)
  }
  function restart() {
    pause()
    applyIndex(0)
  }

  onCleanup(() => clearTimeout(timer))

  const games = createMemo(() => [
    ...(replayStore.games?.regular ?? []),
    ...(replayStore.games?.postseason ?? []),
  ])
  const liveCount = createMemo(() => games().filter(g => g.home_score != null && !g.finalized_at).length)
  const finalCount = createMemo(() => games().filter(g => g.finalized_at).length)

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Replay</span>
        <span class={styles.sublabel}>recorded poll sequence, synthetic time</span>
      </header>
      <p class={styles.note}>
        Drives its own independent store through the session's actual recorded poll responses
        — {pollRecordings().length} captured so far — at a chosen speed, not real clock time.
      </p>
      <Show
        when={pollRecordings().length >= 2}
        fallback={<p class={styles.empty}>Need at least 2 poll cycles recorded (the shared 15s poll interval) — keep this tab open a bit.</p>}
      >
        <div class={styles.controls}>
          <button class={styles.ctrlBtn} onClick={() => (playing() ? pause() : play())}>{playing() ? 'pause' : 'play'}</button>
          <button class={styles.ctrlBtn} onClick={restart}>restart</button>
          <div class={styles.speedGroup}>
            <For each={SPEEDS}>
              {s => (
                <button class={styles.speedBtn} data-active={speed() === s} onClick={() => setSpeed(s)}>
                  {s}×
                </button>
              )}
            </For>
          </div>
        </div>
        <input
          type="range"
          min="0"
          max={pollRecordings().length - 1}
          value={Math.max(0, index())}
          class={styles.scrub}
          aria-label="Replay position"
          aria-valuetext={`recording ${Math.max(0, index()) + 1} of ${pollRecordings().length}`}
          onInput={e => { pause(); applyIndex(Number(e.currentTarget.value)) }}
        />
        <div class={styles.statusRow}>
          <span class={styles.statusChip}>recording {Math.max(0, index()) + 1}/{pollRecordings().length}</span>
          <Show when={index() >= 0 && pollRecordings()[index()]}>
            <span class={styles.statusChip}>{new Date(pollRecordings()[index()].at).toLocaleTimeString()}</span>
          </Show>
          <span class={styles.statusChip}>{liveCount()} live</span>
          <span class={styles.statusChip}>{finalCount()} final</span>
        </div>
      </Show>
    </div>
  )
}
