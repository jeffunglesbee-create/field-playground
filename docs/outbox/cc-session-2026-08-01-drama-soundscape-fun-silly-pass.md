# CC Session Outbox — DramaSoundscape "fun/silly" pass

**Date:** 2026-08-01
**Commit:** `e90565a`

---

## What was asked

"Listened — it's better but the sounds are more generic than fun or
silly." Follow-up to the webaudio-tinysynth swap: the harshness was
gone, but the result read as too straight/serious.

---

## Real, explainable cause — not a vague "make it sillier" guess

A General MIDI instrument voice is built to sound like the real
instrument it's named after. A real trombone patch playing a plain
descending run just sounds like *someone playing trombone* — that's
the timbre doing exactly what it's designed to do. The cartoon
character in an actual "wah-wah trombone" or "boioioing" gag comes
from **performance exaggeration layered on top of the instrument** —
slide glissando, vibrato wobble, pitch overshoot — not from the
instrument choice by itself. The previous commit used real instrument
voices but only ever called plain `noteOn`/`noteOff` — the fixed
timbre problem, the missing-performance problem was untouched.

---

## What changed

Every one of the six gestures now layers `setBend` and/or
`setModulation` (vibrato) on top of the note calls, confirmed real
APIs from the library's own source, not guessed:

- `playBoing`: overshoots the target pitch (bends past the ceiling)
  then settles back down with vibrato — the actual spring-release
  mechanic (a real spring overshoots and wobbles before resting), not
  just a monotonic rising glide.
- `playWahTrombone`: each of the four notes scoops in from slightly
  flat pitch (a real trombone-slide character) instead of triggering
  flat; the final held note wobbles with vibrato instead of sitting
  static.
- `playXyloRun`: lands with a small pitch "boop" overshoot on the top
  note instead of stopping flat; run tempo tightened slightly (0.07s →
  0.06s per note) for more pep.
- `playSuspense`: a vibrato shiver on the final low note.
- `playTaDa`: the held final note wobbles into a flourish partway
  through the hold.

Also swapped the shared "bell" channel's instrument from Tubular Bells
to **Glockenspiel** — Tubular Bells is a dignified church/orchestral
voice by its real-world use; Glockenspiel is the bright, toy-like
voice actually common in game-show "ding!" stings, a better match for
"fun" at the instrument-choice level, independent of the performance
layer above.

Both `setBend` and `setModulation` are channel-wide and persist until
explicitly changed (confirmed from the library's source, not assumed).
`trombone` is shared by two different cues (`playWahTrombone`,
`playSuspense`) — every gesture that turns bend or vibrato on now
resets it to neutral at the end, so one cue can't leak a wobble or
pitch offset into whichever fires next on that channel.

---

## Verified

- `npm run build` — clean.
- **Real CI, both probes re-run against the exaggeration pass:**
  - `soundscape-cdn-load-probe.yml` against the live deployed site:
    enable succeeds, 0 console errors, all 6 preview buttons (now
    exercising the new `setBend`/`setModulation` calls) fire cleanly.
  - `soundscape-live-triggers-probe.yml` against the dev server +
    mock: all 6 real live-polling-driven cues still fire, 0 errors.
- `docs/SUMMARY-2026-07-31-dramasoundscape.md` updated with the full
  writeup, including a note that the closest-pairs distinctness
  question (blowout vs. extra-frames, new-hottest vs. dramatic-final)
  predates this pass and deserves a fresh listen now that both share
  channels have real slide/wobble character layered in.

**Not verified, and cannot be by me:** whether this now actually reads
as fun/silly rather than just "less generic." I can reason about the
real mechanic behind cartoon sound design (performance exaggeration,
not instrument choice) and confirm the code runs without error, but
the perceptual result needs a human ear — same limit stated in every
round of this file so far, holding again here.

---

## Files changed

| Path | Status |
|------|--------|
| `src/components/DramaSoundscape/index.jsx` | modified — bend/vibrato exaggeration on all 6 cues, bell channel swapped to Glockenspiel |
| `docs/SUMMARY-2026-07-31-dramasoundscape.md` | modified — round-2 writeup |
| `outbox/soundscape-cdn-load-probe-2026-08-01T00-50-05-274Z.txt` | new — real CI result |
| `outbox/soundscape-live-triggers-probe-2026-08-01T00-50-10-731Z.txt` | new — real CI result |
