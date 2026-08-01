# CC Session Outbox — DramaSoundscape synth engine swap + deploy pipeline fix

**Date:** 2026-08-01
**Commits:** `b4c5e05` (deploy retry fix), `7d5699d` (synth swap), `3d53010` (probe wording)

---

## What was asked

"Yes, fix. Use GitHub Actions runner for a better sound effects
library." Two separate directives: fix the deploy-pipeline race
condition flagged in the prior session's outbox, and replace the
hand-tuned Tone.js oscillator approach with an actual purpose-built
library rather than keep manually filter-tuning raw waveforms.

---

## Deploy pipeline fix

`deploy-playground.yml`'s post-deploy verification had failed on both
of the prior session's real deploys — once serving a stale bundle hash
10s after upload, once serving the correct hash at a suspicious 573
bytes. Both were Cloudflare edge-propagation lag outrunning a fixed
`sleep 10` + single check; the wrangler upload itself succeeded both
times. Replaced with a 6-attempt retry loop (5s/10s/15s.../30s
backoff, ~105s budget), checking hash match + content-type + size
together each attempt. Still fails hard if the real build never shows
up in that window — not a fallback that hides a genuinely broken
deploy, just giving the edge the time it demonstrably needs.

**Verified for real:** the very next deploy (triggered by the synth
swap commit below) succeeded cleanly on the first attempt under the
new logic — real evidence the fix works, not just reasoning about it.

---

## Sound library research — real candidates checked, not assumed

`registry.npmjs.org` is directly reachable from this sandbox (unlike
most external hosts); `api.github.com`/`raw.githubusercontent.com`
too. Checked real package metadata and READMEs before picking anything:

- **`jsfxr`** — "8-bit sound effects generator based on sfxr" (its own
  npm description). Ruled out: explicitly the retro/chiptune style
  being moved away from.
- **`zzfx`** — "A Tiny JavaScript Sound FX System," also explicitly
  retro-game-jam-flavored. Ruled out for the same reason.
- **`soundfont-player`/`smplr`** — real instrument sample players.
  Ruled out: sampled audio violates this component's own stated
  "every sound is synthesized, none sampled" design constraint.
- **`webaudio-tinysynth`** (`g200kg/webaudio-tinysynth`) — checked
  its actual README and source, not assumed from the name. Apache-2.0,
  zero dependencies. Its own words: "All timbres are generated ...
  algorithmically **without any PCM samples**" — real synthesis,
  compatible with the existing constraint. `quality:0` mode is
  explicitly documented as "chiptune like" (avoided); `quality:1`
  ("FM based") is used here. A real General MIDI instrument map is
  built in — pulled exact program numbers directly from the library's
  own timbre table in source, not the GM spec sheet from memory:
  `Trombone=57`, `Xylophone=13`, `Tubular Bells=14`, `Whistle=78`.

---

## What changed

All six cue functions (`playBoing`, `playWahTrombone`, `playXyloRun`,
`playDing`, `playSuspense`, `playTaDa`) rewritten around real
`noteOn`/`noteOff`/`setBend`/`setProgram` calls against real GM
instrument voices, replacing the hand-tuned `Tone.Synth`/
`Tone.MonoSynth` oscillators from the two prior fixes. One MIDI
channel per cue, same one-instrument-per-gag structure as before.
`playBoing` (lead change) now uses the Whistle program with a
stepped pitch-bend glide instead of a generic sine — confirmed via
source that `setBend` schedules an instantaneous value at each
timestamp (`detune.setValueAtTime`, not a ramp), so several
close-together bend steps approximate the glide the original
`exponentialRampTo` produced. Volume control moved from Tone's dB
scale to the library's own linear 0-1 `setMasterVol()`.

CDN import pattern unchanged (`import(/* @vite-ignore */ 'https://
esm.sh/webaudio-tinysynth@1.1.3')`, runtime-only, same reason as
before — `package.json` unreachable through the original session's
write path).

---

## Verified

- `npm run build` — clean.
- **Real CI, both existing probes re-run against the new engine:**
  - `soundscape-cdn-load-probe.yml` against the live deployed site:
    enable succeeds, 0 console errors, all 6 preview buttons (now
    calling real GM `noteOn`/`noteOff`/`setBend` sequences) fire
    cleanly.
  - `soundscape-live-triggers-probe.yml` against this repo's dev
    server + mock: all 6 real live-polling-driven cues still fire, 0
    errors — confirms the synth swap didn't disturb the reactivity fix
    from the prior session.
- `scripts/probe-soundscape-cdn-load.mjs`'s own log text corrected —
  it still said "Tone.js" throughout despite testing a different
  library; now generic.
- `docs/SUMMARY-2026-07-31-dramasoundscape.md` updated with the full
  engine-swap writeup for the next session.

**Not verified, and cannot be by me:** whether it actually sounds
better than the filtered-MonoSynth version. Real FM-synthesized GM
instrument voices are a well-reasoned technical improvement over raw
oscillators, but "sounds good" needs a human ear — same rule this
file has stated twice now.

---

## Files changed

| Path | Status |
|------|--------|
| `.github/workflows/deploy-playground.yml` | modified — retry-with-backoff post-deploy check |
| `src/components/DramaSoundscape/index.jsx` | modified — full synth engine swap |
| `scripts/probe-soundscape-cdn-load.mjs` | modified — stale Tone.js wording fixed |
| `docs/SUMMARY-2026-07-31-dramasoundscape.md` | modified — engine-swap section added |
| `outbox/soundscape-cdn-load-probe-2026-08-01T00-35-47-466Z.txt` | new — real CI result, post-swap |
| `outbox/soundscape-live-triggers-probe-2026-08-01T00-35-59-318Z.txt` | new — real CI result, post-swap |
