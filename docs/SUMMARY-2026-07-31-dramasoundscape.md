# Summary for Claude Code — DramaSoundscape

**Date:** 2026-07-31
**From:** chat (claude.ai)
**Repo:** field-playground
**Purpose:** handoff context for whichever Claude Code session next
touches this component — written assuming zero shared context with the
chat conversation that produced it.

---

## What this is

The first non-visual surface in this playground. Everything else here
(ScoreTicker, Arbitrage, LiveWpTicker, WpSourceBadge, etc.) is a visual
widget. `DramaSoundscape` sonifies real game transitions with original,
synthesized cartoon sound effects — a boing, a slide-whistle-style
pitch bend, a trombone wah-wah, a xylophone run, a bell/fanfare.
**Synthesis engine swapped 2026-08-01 (Tone.js → webaudio-tinysynth)
— see its own section below before touching audio code.**

**Deliberately NOT ambient/atmospheric.** The original creative pitch
was closer to that register (rising tones, sustained pads); it was
redirected toward comedic, recognizable cartoon SFX because that's
FIELD's own established voice register (WARM/UPLIFTING/CHEEKY/WRY, per
Voice Positioning v4) and because "fun" is a checkable creative target
in a way "ethereal" mostly isn't. If this gets extended, stay in that
register — don't drift back toward moody/atmospheric.

**Every sound is synthesized, none sampled.** No audio files, no
franchise references in comments, UI text, or component names. This
evokes a generic, decades-old cartoon-SFX vocabulary (slide whistle,
boing, wah-wah trombone are non-proprietary tropes), not a specific
franchise. Keep it that way if extending.

---

## Synthesis engine: webaudio-tinysynth (swapped from Tone.js, 2026-08-01)

User, listening for real, twice: first "sounds 8-bit but not in a good
way" (raw unfiltered Tone.js `sawtooth`/`square` oscillators — fixed
with a `Tone.MonoSynth` lowpass filter, which addressed the literal
harshness but was still hand-tuned raw oscillators), then explicitly
"use GitHub Actions runner for a better sound effects library" rather
than keep hand-tuning. Researched real candidates before picking one —
`jsfxr` and `zzfx` were both ruled out on their own documentation
(both explicitly retro/chiptune-style generators, the direction being
moved away from). Landed on **webaudio-tinysynth**
(`g200kg/webaudio-tinysynth`, Apache-2.0, zero dependencies): its own
README states "All timbres are generated ... algorithmically without
any PCM samples" — real synthesis, no samples, matching this
component's existing constraint. Use `quality:1` ("FM based") — its
`quality:0` mode is explicitly documented as "chiptune like," the
exact thing being moved away from.

Real General MIDI instrument programs, each confirmed directly against
the library's own timbre table in source (not the GM spec sheet from
memory): `Trombone=57`, `Xylophone=13`, `Glockenspiel=9`, `Whistle=78`
— used for lead-change/`playBoing` instead of a generic sine, a
better thematic fit for a slide-whistle glide than the original choice
ever was. One MIDI channel per cue (`CH` in the component), matching
the original one-instrument-per-gag structure. API is MIDI-message
based (`noteOn`/`noteOff`/`setBend`/`setProgram`/`setModulation`), a
real, different, and genuinely learnable programming model from
Tone.js's trigger-based API — don't assume Tone.js idioms carry over
if you touch this again.

**Round 2, same day, user listening again: "it's better but the
sounds are more generic than fun or silly."** Real, explainable cause:
a GM instrument voice is built to sound like a real instrument — a
real trombone patch playing a plain descending run just sounds like
someone playing trombone. The cartoon character in an actual
"wah-wah trombone" or "boioioing" comes from PERFORMANCE exaggeration
layered on top of the instrument (slide glissando, vibrato wobble,
pitch overshoot), not from instrument choice alone. Every one of the
six gestures now uses `setBend`/`setModulation` for exactly that, not
just `noteOn`/`noteOff`:
- `playBoing`: overshoots the target pitch then settles with vibrato
  — the actual spring-release mechanic.
- `playWahTrombone`: each note scoops in from slightly flat (a real
  slide), the held final note wobbles instead of sitting static.
- `playXyloRun`: lands with a small pitch "boop" overshoot.
- `playSuspense`: a vibrato shiver on the final low note.
- `playTaDa`: the held final note wobbles into a flourish.

Also swapped the bell channel from `Tubular Bells` to `Glockenspiel`
— Tubular Bells reads as a dignified church/orchestral instrument (its
real-world use); Glockenspiel is the bright, toy-like voice actually
common in game-show "ding!" stings.

Both `setBend` and `setModulation` are channel-wide and persist until
explicitly changed (confirmed from source, not assumed) — every
gesture that turns one on resets it at the end, since `trombone` is
shared by two cues (`playWahTrombone`, `playSuspense`) and a leaked
vibrato/bend would corrupt whichever fires next on that channel.

**Still the same CDN-at-runtime constraint as before, same reason:**
`package.json` is not reachable through the mobile-chat session's
write path that first built this file (confirmed: not in its MCP
read/write allowlist). Current approach:
`import(/* @vite-ignore */ 'https://esm.sh/webaudio-tinysynth@1.1.3')`
inside the enable-sound handler only, never at module load time. If
you have a write path to `package.json` that session didn't, adding
`webaudio-tinysynth` as a real npm dependency would be the more
idiomatic fix — re-run the same CDN-load probe afterward rather than
assuming the swap is behavior-preserving.

**Perceptual result of this swap is unconfirmed by Claude Code as of
this doc** — verified technically (real CDN load, zero runtime errors,
all 6 cues fire via both the preview buttons and the live path, see
verification section below), not verified to sound good. That needs a
human ear, same rule as the closest-pairs section further down.

---

## The six real triggers — no invented event types

All six reuse fields already confirmed real elsewhere in this project
today, not new data:

| Cue | Real trigger | Function |
|---|---|---|
| 🫠 lead change | `home_score`/`away_score` sign flip | `playBoing()` |
| 🎢 comeback | trailing margin shrinks 3+ in one poll tick | `playXyloRun()` |
| 📉 blowout | margin ≥8 and still growing | `playWahTrombone()` |
| 🔔 new hottest game | `drama_peak` leader across the slate changes | `playDing()` |
| ⏰ extra frames | `went_to_ot` flips false→true | `playSuspense()` |
| 🎉 dramatic final | `finalized_at` newly set + `went_to_ot` true | `playTaDa()` |

**Deliberately does NOT fetch inning/period data.** `deskStore` has no
inning field (a pre-existing, documented gap — see `LiveWpTicker`'s own
comments, which is why *that* component fetches `statsapi.mlb.com`
directly). Duplicating that separate fetch pipeline into a second
component would recreate the exact disconnected-systems pattern this
project has flagged more than once. `went_to_ot` was used instead as a
real, already-available proxy. If a future version needs true live
inning awareness, reuse `LiveWpTicker`'s existing fetch rather than
building a second one.

---

## What's verified, and how — reusable pattern for future audio/CDN work

Two-layer verification was necessary here, and the two layers prove
genuinely different things:

1. **`artifact-check.yml` (offline mode, all fetches aborted)** — proves
   the component's initial state renders without crashing anything.
   Does NOT prove the CDN import works, because the import only fires
   after a user click, which offline mode never simulates.
2. **`scripts/probe-soundscape-cdn-load.mjs` (real network, real
   browser via Playwright)** — navigates to the real deployed site,
   clicks "tap to enable sound" for real, confirms the synth library
   genuinely loads and its audio context unlocks, then clicks all 6
   preview buttons and confirms zero console/page errors across all 6
   real sound-generating code paths. Generic to whichever library is
   in use — its own text no longer names Tone.js specifically.

**Both are required for a component like this. If you build another
CDN-dependent or interaction-gated feature, write the second kind of
check too — a clean offline render pass alone is not sufficient
evidence that the real interactive path works.**

Latest confirmed-clean run (against the webaudio-tinysynth swap):
6/6 preview buttons found and clickable, 0 errors. Full result in
`outbox/soundscape-cdn-load-probe-2026-08-01T00-35-47-466Z.txt`.

---

## A THIRD gap the two-layer pattern above missed — real bug, real fix

Reported 2026-07-31: "soundboard doesn't play live." Both layers above
passed clean, and both were genuinely correct about what they tested —
neither one exercises the actual polling-driven trigger path (the six
real transition checks that run every time `deskStore` updates, not
the six preview buttons). That gap is exactly how this shipped broken.

**Root cause, confirmed in isolation (node test, solid-js core, no
DOM) before touching the fix:** the trigger-detection logic was a bare
`createMemo(() => {...})` whose return value nothing ever read.
`createMemo` is lazy/pull-based in Solid — with zero consumers there
is nothing to pull, so it runs exactly once at creation and never
re-runs on subsequent dependency changes, no matter how many times
`deskStore` actually updates. **Fix: `createEffect` instead** — push-
based, always re-runs when its tracked dependencies change, which is
what a side-effect-only computation (detect a transition, push a log
entry, play a sound) actually needs.

**A second, compounding gap found while investigating:** the dev
mock's game data never actually varied in the ways any of the six
cues check for — no `drama_peak` at all, no repeated score deltas on
the same live game, no false→true `went_to_ot`/`finalized_at`
transition. Even with the reactivity bug fixed, none of the six cues
were reachable locally before `vite.config.js`'s mock was extended
with a staged transition ladder (see its own comment for the exact
schedule). One nuance worth keeping in mind if you touch that ladder:
the dev server fires 3 near-simultaneous `/context/date/` requests at
page mount (confirmed via server-side request timestamps — a benign,
pre-existing Vite/HMR dev-only startup burst, unrelated to this
component) before settling into a clean one-request-per-poll cadence.
A count-keyed ladder has to start comfortably past that burst (this
one starts at request 5) or its early steps silently get skipped.

**New regression coverage:** `scripts/probe-soundscape-live-triggers.mjs`
+ `.github/workflows/soundscape-live-triggers-probe.yml` — starts this
repo's own dev server (not the deployed site; the deployed site's real
relay data can't be staged into a deterministic sequence), watches the
component's own log across real polls, and asserts all six real cues
actually fire via the real live path. This is deliberately separate
from `probe-soundscape-cdn-load.mjs`, which still only covers the
preview buttons — both are needed now, same "write the check for the
path you didn't just test" lesson as the two-layer section above.

---

## A real dead-code bug this session caught in itself, worth the pattern

The first build included a 7th sound function, `playWhistle`, with a
comment saying it was "kept for symmetry/reuse." A mechanical check
(grep for real call sites, not just definitions) found it was never
actually called by any of the six real triggers — genuine dead code,
the same pattern this project has repeatedly flagged in production
(unwired note-generator functions, disconnected boost systems, etc.).
It's been removed, along with a comment elsewhere that referenced its
behavior after removal (also caught and fixed).

**If you add a 7th cue or modify these functions: after any change,
grep for `if (enabled()) play` call sites and confirm every defined
function has at least one real caller before considering the change
done.** This is now a known, recurring failure mode in this specific
file, not a one-off.

---

## What's open — and one item is explicitly human-gated, not yours to resolve

Six on-demand preview buttons exist specifically so a human can check
each sound by ear without waiting for a real game transition. **Two
pairs share an oscillator timbre and are the closest to each other,
confirmed by a mechanical distinctness check (not a guess):**

- blowout (`playWahTrombone`) vs. extra-frames (`playSuspense`) — both
  use the `trombone` GM channel, distinguished by register (mid-low
  descending slide with a wobble finish vs. very-low repeat-then-drop
  with a shiver) and note pattern.
- new-hottest (`playDing`) vs. dramatic-final (`playTaDa`) — both use
  the `bell` (Glockenspiel GM) channel, distinguished by length (2
  notes vs. 4 notes, the latter now wobbling into a flourish) and
  starting register.

(This pairing predates both the webaudio-tinysynth swap and the
performance-exaggeration pass, and wasn't re-evaluated by either — same
two structurally-closest pairs, now with real slide/wobble character
layered in, but still worth a fresh listen given how much has changed.)

**Whether these are perceptually distinguishable to a human ear is
explicitly NOT something to try to resolve mechanically.** No script
can answer this — it requires an actual person listening. If asked to
"fix" or "improve" this, the right move is surfacing the question, not
guessing at a synthesis change and hoping it sounds more different —
that would be exactly the kind of unverified confidence this project
has repeatedly corrected elsewhere. If a human confirms one pair reads
as too similar, THEN it's a concrete, scoped fix (e.g., swap one pair
to a different oscillator type) — but that confirmation hasn't
happened yet as of this doc.

---

## Files

- `src/components/DramaSoundscape/index.jsx` — component + all 6 sound functions
- `src/components/DramaSoundscape/DramaSoundscape.module.css`
- `scripts/probe-soundscape-cdn-load.mjs` — reusable pattern for future CDN/interaction verification
- `.github/workflows/soundscape-cdn-load-probe.yml` — `workflow_dispatch` only, not scheduled (this checks a UI interaction path, not slowly-drifting data — rerun manually after any change to this component rather than relying on a schedule to catch it)
- Wired into `src/App.jsx` (Games tab) and `src/App.module.css` (shared section layout rule)
