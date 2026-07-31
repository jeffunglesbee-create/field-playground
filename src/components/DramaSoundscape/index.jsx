import { For, Show, createSignal, createMemo, createEffect, onCleanup } from 'solid-js'
import { deskStore } from '../../data/relay'
import styles from './DramaSoundscape.module.css'

// DramaSoundscape — the first non-visual surface in this playground.
// Explicitly NOT ambient/atmospheric (the original pitch was closer to
// that -- rising tones, sustained pads). Redirected toward comedic,
// recognizable cartoon SFX -- boings, slide-whistle glides, trombone
// wah-wahs, xylophone runs, a game-show "ding!" -- because that's
// FIELD's own established register (WARM/UPLIFTING/CHEEKY/WRY) and
// because "fun" is a real, checkable creative target in a way
// "ethereal" mostly isn't.
//
// EVERY SOUND IS SYNTHESIZED, NONE SAMPLED. Tone.js oscillators/
// envelopes only -- no audio files, no licensed or franchise material.
// This deliberately evokes a generic cartoon-SFX VOCABULARY (the
// slide whistle, the boing, the wah-wah trombone are decades-old,
// non-proprietary sound tropes) without naming or referencing any
// specific franchise anywhere in this file or the UI.
//
// Tone.js loads from a CDN ESM import at runtime, not an npm
// dependency -- package.json isn't reachable through this session's
// write path (confirmed: not in the MCP read/write allowlist, and
// read_source returned zero hits for it too, matching a documented
// unreliability of that tool). This sandbox can't fetch the CDN URL
// directly either (host_not_allowed -- its own egress allowlist, not
// a real rejection), so the actual proof this loads is the render
// harness running in a real headless browser via CI, same as every
// other verification this session has relied on.
//
// SIX TRIGGERS, ALL FROM FIELDS ALREADY CONFIRMED REAL TODAY -- no
// invented event types:
//   lead change        -- home_score/away_score sign flip
//   comeback            -- deficit shrinking fast (reuses round 2's
//                          comeback_magnitude shape, simplified to a
//                          live per-tick delta rather than a final
//                          game-level max)
//   blowout developing  -- |diff| crossing a threshold, growing
//   new hottest game     -- drama_peak leader across the slate changing
//                          (same ranking TonightsPick already computes)
//   extra frames         -- went_to_ot flipping true (real field;
//                          deliberately NOT a separate inning fetch --
//                          duplicating LiveWpTicker's statsapi pipeline
//                          into a second component would be exactly
//                          the disconnected-systems pattern flagged
//                          more than once elsewhere in this project)
//   dramatic final        -- finalized_at newly set + went_to_ot true,
//                          i.e. the game that just ended went the
//                          distance
//
// NEVER AUTOPLAYS. Browsers block audio without a user gesture, and
// it's the right call regardless -- a tap-to-enable gate, off by
// default, with the trigger log visible even before sound is enabled
// so the mapping is inspectable without needing audio on at all.

const CDN_URL = 'https://esm.sh/tone@15'

function gameKey(g) { return g.away + '@' + g.home }

function gameStatus(g) {
  if (g.home_score === null) return 'pre'
  if (g.finalized_at) return 'final'
  return 'live'
}

export function DramaSoundscape() {
  const [enabled, setEnabled] = createSignal(false)
  const [volume, setVolume] = createSignal(-8) // dB, Tone's scale
  const [loading, setLoading] = createSignal(false)
  const [loadError, setLoadError] = createSignal(null)
  const [log, setLog] = createSignal([]) // [{id, label, icon, t}]
  const [synths, setSynths] = createSignal(null)

  // Previous-tick snapshot per game, to detect real TRANSITIONS rather
  // than re-firing on every unchanged poll.
  let prevByKey = {}
  let prevHottest = null

  function pushLog(label, icon) {
    setLog(l => [{ id: Math.random().toString(36).slice(2), label, icon, t: Date.now() }, ...l].slice(0, 12))
  }

  async function enableSound() {
    setLoading(true)
    setLoadError(null)
    try {
      const Tone = await import(/* @vite-ignore */ CDN_URL)
      await Tone.start() // the required user-gesture unlock

      // Five small synths, each built for ONE cartoon gesture rather
      // than one general-purpose voice doing everything -- matches how
      // real cartoon scoring works, a different instrument per gag.
      //
      // FOUND 2026-07-31 (user, listening for real: "Sounds 8-bit but
      // not in a good way"): boing/bell are sine -- a pure tone has no
      // harmonics to sound harsh, sine can't produce that. trombone/
      // xylo were raw Tone.Synth on sawtooth/square routed straight to
      // toDestination() with NO filtering at all -- an unfiltered
      // sawtooth/square is *exactly* what unfiltered NES/Game Boy chip
      // audio is, harmonically. That's the real, explainable cause, not
      // a vague "make it sound better" guess. Fix: Tone.MonoSynth
      // instead of Tone.Synth for these two specifically -- it adds a
      // built-in lowpass filter + filterEnvelope, the standard
      // subtractive-synthesis way to turn a raw waveform into something
      // that reads as an instrument rather than a chip tone. For
      // trombone this doubles as a genuine "wah" (a filter envelope
      // sweep IS what a wah pedal does) -- not just noise reduction,
      // an on-theme improvement for a function literally called
      // playWahTrombone. Perceptual result needs a human ear to
      // actually confirm -- same rule as the closest-pairs section
      // below, not something to claim fixed by inspection alone.
      const boing = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
      }).toDestination()

      const trombone = new Tone.MonoSynth({
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.05, decay: 0.1, sustain: 0.4, release: 0.3 },
        filter: { type: 'lowpass', rolloff: -24, Q: 1 },
        filterEnvelope: { attack: 0.05, decay: 0.2, sustain: 0.3, release: 0.3, baseFrequency: 200, octaves: 3 },
      }).toDestination()

      const xylo = new Tone.MonoSynth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.02 },
        filter: { type: 'lowpass', rolloff: -12, Q: 0.5 },
        filterEnvelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02, baseFrequency: 800, octaves: 3 },
      }).toDestination()

      const bell = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.3, sustain: 0.1, release: 0.4 },
      }).toDestination()

      const s = { Tone, boing, trombone, xylo, bell }
      s.boing.volume.value = volume()
      s.trombone.volume.value = volume(); s.xylo.volume.value = volume()
      s.bell.volume.value = volume()
      setSynths(s)
      setEnabled(true)
    } catch (e) {
      setLoadError(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }

  onCleanup(() => {
    const s = synths()
    if (s) { s.boing.dispose(); s.trombone.dispose(); s.xylo.dispose(); s.bell.dispose() }
  })

  // --- The six cartoon gestures ---

  function playBoing() {
    // A quick upward pitch-bent blip, decaying fast -- the spring-
    // release "boing." One note, portamento-glided.
    const s = synths(); if (!s) return
    const now = s.Tone.now()
    s.boing.triggerAttack('C4', now)
    s.boing.frequency.exponentialRampTo('A4', 0.12, now)
    s.boing.triggerRelease(now + 0.15)
  }

  function playWahTrombone() {
    // Three descending notes with a slow vibrato-ish wobble on the
    // last one -- the classic disappointment "wah-wah-wah-waaah."
    const s = synths(); if (!s) return
    const now = s.Tone.now()
    const notes = ['G3', 'F3', 'D3', 'C3']
    notes.forEach((n, i) => s.trombone.triggerAttackRelease(n, i === 3 ? 0.5 : 0.18, now + i * 0.2))
  }

  function playXyloRun() {
    // A fast ascending run of DISCRETE notes, accelerating -- the
    // "climbing back in" cartoon run. Distinct from playBoing's single
    // pitch-bent glide: this is a stepped sequence, not a continuous ramp.
    const s = synths(); if (!s) return
    const now = s.Tone.now()
    const notes = ['C4', 'D4', 'E4', 'G4', 'C5']
    notes.forEach((n, i) => s.xylo.triggerAttackRelease(n, 0.08, now + i * 0.07))
  }

  function playDing() {
    // A bright bell + a two-note tiny fanfare -- game-show "correct
    // answer," for a new hottest game taking the slate's lead.
    const s = synths(); if (!s) return
    const now = s.Tone.now()
    s.bell.triggerAttackRelease('E5', 0.4, now)
    s.bell.triggerAttackRelease('C6', 0.5, now + 0.12)
  }

  function playSuspense() {
    // Three low notes, deliberately over-fast for the register (a
    // real suspense sting is slow; playing it too quick is what makes
    // it read as a gag rather than genuinely ominous).
    const s = synths(); if (!s) return
    const now = s.Tone.now()
    const notes = ['C2', 'C2', 'G1']
    notes.forEach((n, i) => s.trombone.triggerAttackRelease(n, 0.2, now + i * 0.18))
  }

  function playTaDa() {
    // Ascending major triad + octave, held -- the cartoon "ta-da!"
    const s = synths(); if (!s) return
    const now = s.Tone.now()
    const notes = ['C4', 'E4', 'G4', 'C5']
    notes.forEach((n, i) => s.bell.triggerAttackRelease(n, i === 3 ? 0.6 : 0.15, now + i * 0.1))
  }

  // --- Real-data transition detection ---

  const games = createMemo(() => [...(deskStore.games?.regular ?? []), ...(deskStore.games?.postseason ?? [])])

  // REAL BUG, FOUND 2026-07-31 (user report: "soundboard doesn't play
  // live"): this was a bare createMemo whose return value nothing ever
  // reads. Confirmed in isolation (node test, solid-js core, no DOM):
  // an unread createMemo runs exactly ONCE at creation and never
  // re-runs on subsequent dependency changes -- memos are lazy/pull-
  // based in Solid, so with zero consumers there is nothing to pull.
  // createEffect is push-based and always re-runs when its tracked
  // dependencies change, which is what a side-effect-only computation
  // (detecting transitions, firing sounds) actually needs.
  createEffect(() => {
    const list = games()
    if (!list.length) return

    // Slate-wide: has the drama_peak leader changed?
    const withPeak = list.filter(g => typeof g.drama_peak === 'number')
    if (withPeak.length) {
      const hottest = [...withPeak].sort((a, b) => b.drama_peak - a.drama_peak)[0]
      const hk = gameKey(hottest)
      if (prevHottest !== null && prevHottest !== hk) {
        pushLog(`${hottest.away} @ ${hottest.home} takes the slate lead`, '🔔')
        if (enabled()) playDing()
      }
      prevHottest = hk
    }

    for (const g of list) {
      const k = gameKey(g)
      const prev = prevByKey[k]
      const status = gameStatus(g)

      if (prev && status === 'live' && prev.status === 'live' &&
          g.home_score !== null && prev.home_score !== null) {
        const prevDiff = prev.home_score - prev.away_score
        const diff = g.home_score - g.away_score

        // Lead change: sign flipped (and it wasn't already 0-0)
        if (prevDiff !== 0 && diff !== 0 && Math.sign(prevDiff) !== Math.sign(diff)) {
          pushLog(`${g.away} @ ${g.home} — lead change`, '🫠')
          if (enabled()) playBoing()
        }

        // Comeback: the trailing margin shrank by 3+ in one tick
        const prevMargin = Math.abs(prevDiff)
        const margin = Math.abs(diff)
        if (prevMargin - margin >= 3 && margin > 0) {
          pushLog(`${g.away} @ ${g.home} — closing fast`, '🎢')
          if (enabled()) playXyloRun()
        }

        // Blowout developing: margin crosses 8+ and is still growing
        if (margin >= 8 && margin > prevMargin) {
          pushLog(`${g.away} @ ${g.home} — getting away from them`, '📉')
          if (enabled()) playWahTrombone()
        }
      }

      // Extra frames just started (went_to_ot flips false -> true)
      if (prev && !prev.went_to_ot && g.went_to_ot) {
        pushLog(`${g.away} @ ${g.home} — extra frames`, '⏰')
        if (enabled()) playSuspense()
      }

      // Just went final, and it went the distance
      if (prev && prev.status !== 'final' && status === 'final' && g.went_to_ot) {
        pushLog(`${g.away} @ ${g.home} — final, the hard way`, '🎉')
        if (enabled()) playTaDa()
      }

      prevByKey[k] = { home_score: g.home_score, away_score: g.away_score, status, went_to_ot: g.went_to_ot }
    }
  })

  return (
    <div class={styles.root}>
      <header class={styles.header}>
        <span class={styles.label}>Drama Soundscape</span>
        <span class={styles.note}>cartoon SFX, not ambient tone — every sound is a real game transition</span>
      </header>

      <Show when={!enabled()}>
        <button class={styles.enableBtn} onClick={enableSound} disabled={loading()}>
          {loading() ? 'loading…' : '🔊 tap to enable sound'}
        </button>
        <Show when={loadError()}>
          <p class={styles.error}>Couldn't load: {loadError()}</p>
        </Show>
      </Show>

      <Show when={enabled()}>
        <div class={styles.controls}>
          <span class={styles.onBadge}>● sound on</span>
          <label class={styles.volLabel}>
            vol
            <input
              type="range" min="-30" max="0" value={volume()}
              onInput={e => {
                const v = Number(e.target.value)
                setVolume(v)
                const s = synths()
                if (s) { s.boing.volume.value = v; s.trombone.volume.value = v; s.xylo.volume.value = v; s.bell.volume.value = v }
              }}
            />
          </label>
        </div>

        {/* On-demand preview -- waiting for a real lead change to check
            whether a sound design actually works is impractical. Same
            functions the real triggers call, fired directly. This is
            also how the blowout/extra-frames pair (shared trombone) and
            new-hottest/dramatic-final pair (shared bell) -- the two
            structurally-closest sounds, confirmed by a distinctness
            check across oscillator type and note pattern -- are meant
            to be checked specifically against each other. */}
        <div class={styles.previewRow}>
          <span class={styles.previewLabel}>preview:</span>
          <button class={styles.previewBtn} onClick={playBoing}>🫠 lead change</button>
          <button class={styles.previewBtn} onClick={playXyloRun}>🎢 comeback</button>
          <button class={styles.previewBtn} onClick={playWahTrombone}>📉 blowout</button>
          <button class={styles.previewBtn} onClick={playDing}>🔔 new hottest</button>
          <button class={styles.previewBtn} onClick={playSuspense}>⏰ extra frames</button>
          <button class={styles.previewBtn} onClick={playTaDa}>🎉 dramatic final</button>
        </div>
      </Show>

      <div class={styles.legend}>
        <span>🫠 lead change</span>
        <span>🎢 comeback</span>
        <span>📉 blowout</span>
        <span>🔔 new hottest</span>
        <span>⏰ extra frames</span>
        <span>🎉 dramatic final</span>
      </div>

      <Show when={log().length} fallback={<p class={styles.empty}>Watching for real transitions…</p>}>
        <ul class={styles.logList}>
          <For each={log()}>
            {entry => <li class={styles.logItem}><span>{entry.icon}</span> {entry.label}</li>}
          </For>
        </ul>
      </Show>
    </div>
  )
}
