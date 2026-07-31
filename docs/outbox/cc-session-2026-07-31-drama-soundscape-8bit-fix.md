# CC Session Outbox — DramaSoundscape "8-bit" sound quality fix

**Date:** 2026-07-31
**Commit:** `925335c`

---

## What was reported

User, after actually listening (not a functional bug this time —
the live-trigger fix from earlier the same session already landed):
"Sounds 8-bit but not in a good way."

---

## Real, explainable cause — not a vague quality guess

Two synths are pure sine (`boing`, `bell`) — a sine wave has no
harmonics at all, it's physically incapable of sounding harsh or
"chiptune." The other two (`trombone`, used by `playWahTrombone` and
`playSuspense`; `xylo`, used by `playXyloRun`) were raw `Tone.Synth`
on `sawtooth`/`square` oscillators routed straight to
`.toDestination()` — **zero filtering anywhere in the signal chain.**
An unfiltered sawtooth or square wave is, harmonically, exactly what
unfiltered NES/Game Boy chip audio is. "8-bit" is a precise, correct
description of what that combination produces, not an exaggeration.

## Fix

`trombone` and `xylo` switched from `Tone.Synth` to `Tone.MonoSynth`,
which adds a built-in lowpass filter + `filterEnvelope` — the standard
subtractive-synthesis technique for turning a raw waveform into
something that reads as an instrument rather than a chip tone. For
`trombone` this is also a genuine on-theme improvement, not just noise
reduction: a filter envelope sweep is literally what a wah pedal does,
and the function it feeds is called `playWahTrombone`. `boing`/`bell`
left untouched — sine can't produce the reported problem, so there was
nothing there to fix.

---

## Verified — and what's honestly still unverified

**Verified technically:** real CI run against the live deployed site
(`soundscape-cdn-load-probe.yml`, `outbox/soundscape-cdn-load-probe-
2026-07-31T23-57-27-897Z.txt`) — enable-sound succeeds, `Tone.
MonoSynth` constructs without error, and all 6 preview buttons
(including 📉 blowout / `playWahTrombone` and 🎢 comeback /
`playXyloRun`, the two changed functions) fire with zero console/page
errors. `Tone.MonoSynth` is confirmed real and API-valid in the
pinned `tone@15` CDN build, not assumed.

**Not, and cannot be, verified by me:** whether it actually sounds
better. I can't listen. This fixes the specific, identifiable
technical cause of an unfiltered-chip-tone sound and applies the
standard remedy correctly, but per this file's own established rule
("[perceptual distinguishability] requires an actual person listening
... not something to try to resolve mechanically") — the real
confirmation is the user's ear on the next listen, not a claim made
here.

---

## Deploy pipeline note (found along the way, not caused by this change)

Both deploys triggered by this session's commits (`0bcc382`,
`925335c`) had their wrangler upload succeed but their post-deploy
verification step fail — once on a stale bundle hash still being
served 10s after upload, once on the correct hash but a suspiciously
small (573-byte) response. Both read as Cloudflare edge-propagation
lag outrunning the workflow's fixed `sleep 10`, not a broken deploy
(the CDN probe run moments later, against the same live site, found
the full real bundle with zero errors). Not fixed in this session —
flagged here rather than left silent, since it's now failed twice in
a row and would confuse whoever next checks that workflow's status.

---

## Files changed

| Path | Status |
|------|--------|
| `src/components/DramaSoundscape/index.jsx` | modified — `trombone`/`xylo` switched to `Tone.MonoSynth` with filter + filterEnvelope |
