import { For, Show, createSignal, createResource, onCleanup } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { dramaLeaderboard } from '../../data/relay'
import { buildGameSymphony } from '../../data/gameSymphony'
import { createCartoonSynth, CUE_TO_GESTURE } from '../../data/cartoonSynth'
import { CUE_META } from '../../data/dramaCueEngine'
import styles from './GameSymphonyArchive.module.css'

// Game Symphony Archive — DramaSoundscape's six cues fire live and
// vanish. This reconstructs the REAL cue sequence and REAL relative
// timing a completed dramatic game actually produced, from real MLB
// Stats API play data (docs/outbox/... symphony probe, CI-verified
// before any UI existed here) -- condensed into a REPLAY_DURATION_MS
// (20s) composition, played back through the exact same real
// synthesized sounds (src/data/cartoonSynth.js, extracted verbatim
// from DramaSoundscape) and persisted to a local gallery so it can be
// replayed without re-fetching.
//
// HONEST LIMITS, stated plainly rather than hidden:
//   - Not every real dramatic game produces a reconstructable cue --
//     the probe run found only 2 of 5 possible cue types fired for its
//     one tested real game, even after bucketing play data to match
//     live polling granularity (src/data/gameSymphony.js's own header
//     explains why). This tries each real candidate from the
//     leaderboard in order until one yields at least one real cue,
//     and says so if none do, rather than silently picking a
//     zero-cue game.
//   - Persistence is per-browser localStorage, not cross-visitor
//     shared storage (window.storage's shared mode is a separate,
//     not-yet-investigated capability -- see the other pitched
//     features). "Shared" here means exportable as real JSON, not a
//     hosted multi-user share.

const GALLERY_KEY = 'field-playground:gameSymphonyGallery'

function loadGallery() {
  try {
    const raw = localStorage.getItem(GALLERY_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveGallery(list) {
  try { localStorage.setItem(GALLERY_KEY, JSON.stringify(list)) } catch { /* storage unavailable/full -- gallery just won't persist, not fatal */ }
}

async function findFirstPlayableCandidate(games) {
  const tried = []
  for (const g of games) {
    if (!g.date) continue
    const result = await buildGameSymphony(g.date, g.home, g.away)
    tried.push({ matchup: `${g.away} @ ${g.home}`, cueCount: result.cues?.length ?? 0, error: result.error })
    if (!result.error && result.cues?.length) {
      return { ...result, home: g.home, away: g.away, date: g.date, tried }
    }
  }
  return { error: null, cues: [], tried, exhausted: true }
}

function playTimeline(synthApi, cues, onCuePlay) {
  const timers = cues.map(c => {
    const fn = synthApi[CUE_TO_GESTURE[c.cue]]
    return setTimeout(() => { fn?.(); onCuePlay?.(c) }, c.compressedOffsetMs)
  })
  return () => timers.forEach(clearTimeout)
}

export function GameSymphonyArchive() {
  const [candidate] = createResource(dramaLeaderboard, async lb => {
    if (!lb || lb.error) return null
    const games = lb.games ?? []
    if (!games.length) return { error: null, cues: [], tried: [], exhausted: true }
    return findFirstPlayableCandidate(games)
  })

  const [gallery, setGallery] = createSignal(loadGallery())
  const [playing, setPlaying] = createSignal(null) // key of whatever's currently playing: 'live' or a gallery id
  const [playedCues, setPlayedCues] = createStore({})
  const [playError, setPlayError] = createSignal(null)
  let synthApi = null
  let stopPlayback = null

  onCleanup(() => { stopPlayback?.(); synthApi?.dispose?.() })

  async function ensureSynth() {
    if (!synthApi) synthApi = await createCartoonSynth({ volume: 0.6 })
    return synthApi
  }

  async function handlePlay(key, cues) {
    stopPlayback?.()
    setPlayedCues(reconcile({}))
    setPlayError(null)
    setPlaying(key)
    // Same real failure mode DramaSoundscape's own enableSound() guards
    // against (webaudio-tinysynth loads from a CDN ESM import at
    // runtime) -- an honest error state here, not an unhandled
    // rejection, if the CDN can't be reached.
    try {
      const api = await ensureSynth()
      stopPlayback = playTimeline(api, cues, c => setPlayedCues(p => ({ ...p, [c.cue]: true })))
      setTimeout(() => { if (playing() === key) setPlaying(null) }, (cues[cues.length - 1]?.compressedOffsetMs ?? 0) + 500)
    } catch (e) {
      setPlayError(String(e?.message ?? e))
      setPlaying(null)
    }
  }

  function handleSave() {
    const c = candidate()
    if (!c || c.error || !c.cues?.length) return
    const entry = {
      id: Math.random().toString(36).slice(2),
      matchup: `${c.away} @ ${c.home}`,
      date: c.date,
      cues: c.cues,
      savedAt: Date.now(),
    }
    const next = [entry, ...gallery()].slice(0, 20)
    setGallery(next)
    saveGallery(next)
  }

  function handleDelete(id) {
    const next = gallery().filter(e => e.id !== id)
    setGallery(next)
    saveGallery(next)
  }

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Game Symphony Archive</span>
      </header>
      <p class={styles.note}>
        A completed dramatic game's real cue sequence, reconstructed from real MLB Stats API play
        data and condensed into a {'20'}s composition — the same real sounds Drama Soundscape plays
        live, but persisted instead of vanishing.
      </p>

      <Show when={candidate.loading}>
        <p class={styles.loading}>Reconstructing a real dramatic game…</p>
      </Show>

      <Show when={candidate.error}>
        <p class={styles.error}>Unable to load: {String(candidate.error?.message ?? candidate.error)}</p>
      </Show>

      <Show when={!candidate.loading && !candidate.error && candidate()}>
        {c => (
          <Show
            when={c().cues?.length}
            fallback={
              <div class={styles.empty}>
                <p>No reconstructable cue sequence found in today's real leaderboard sample.</p>
                <Show when={c().tried?.length}>
                  <ul class={styles.triedList}>
                    <For each={c().tried}>
                      {t => <li>{t.matchup}: {t.error ? t.error : `${t.cueCount} real cues`}</li>}
                    </For>
                  </ul>
                </Show>
              </div>
            }
          >
            <div class={styles.matchup}>
              <span>{c().away} @ {c().home}</span>
              <span class={styles.cueCount}>{c().cues.length} real cue{c().cues.length === 1 ? '' : 's'}</span>
            </div>

            <button class={styles.playBtn} onClick={() => handlePlay('live', c().cues)}>
              {playing() === 'live' ? '▶ playing…' : '▶ play the 20s symphony'}
            </button>
            <Show when={playError()}>
              <p class={styles.error}>Couldn't play: {playError()}</p>
            </Show>

            <div class={styles.timeline}>
              <For each={c().cues}>
                {cue => (
                  <span class={`${styles.cueChip} ${playing() === 'live' && playedCues[cue.cue] ? styles.cuePlayed : ''}`}>
                    {CUE_META[cue.cue]?.icon} {CUE_META[cue.cue]?.label} · {(cue.compressedOffsetMs / 1000).toFixed(1)}s
                  </span>
                )}
              </For>
            </div>

            <button class={styles.saveBtn} onClick={handleSave}>💾 save to gallery</button>
          </Show>
        )}
      </Show>

      <Show when={gallery().length}>
        <div class={styles.gallery}>
          <span class={styles.galleryLabel}>saved compositions ({gallery().length})</span>
          <ul class={styles.galleryList}>
            <For each={gallery()}>
              {entry => (
                <li class={styles.galleryRow}>
                  <span class={styles.galleryMatchup}>{entry.matchup}</span>
                  <span class={styles.galleryCueCount}>{entry.cues.length} cue{entry.cues.length === 1 ? '' : 's'}</span>
                  <button class={styles.miniBtn} onClick={() => handlePlay(entry.id, entry.cues)}>
                    {playing() === entry.id ? '▶…' : '▶'}
                  </button>
                  <button class={styles.miniBtn} onClick={() => handleDelete(entry.id)}>✕</button>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  )
}
