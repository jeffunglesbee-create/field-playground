// Shared cue-detection logic, extracted verbatim from DramaSoundscape's
// real live createEffect (src/components/DramaSoundscape/index.jsx,
// the per-game loop) so both the LIVE component and any RECONSTRUCTION
// of a completed game's real cue sequence (Game Symphony Archive) run
// the exact same rules -- not two hand-synced copies that can drift.
//
// Deliberately excludes the sixth live cue ("new hottest game," a
// cross-SLATE comparison of drama_peak leaders) -- that's not a
// property of any single game's own state sequence, so it has no
// meaning when reconstructing one game in isolation.
//
// Pure, no DOM/Solid dependency -- importable from both browser code
// and a plain Node CI probe script.

export const CUES = {
  LEAD_CHANGE: 'leadChange',
  COMEBACK: 'comeback',
  BLOWOUT: 'blowout',
  EXTRA_FRAMES: 'extraFrames',
  DRAMATIC_FINAL: 'dramaticFinal',
  WALK_OFF: 'walkOff',
  PHOTO_FINISH: 'photoFinish',
  MILESTONE_DRAMA: 'milestoneDrama',
}

export const CUE_META = {
  [CUES.LEAD_CHANGE]: { icon: '🫠', label: 'lead change' },
  [CUES.COMEBACK]: { icon: '🎢', label: 'closing fast' },
  [CUES.BLOWOUT]: { icon: '📉', label: 'getting away from them' },
  [CUES.EXTRA_FRAMES]: { icon: '⏰', label: 'extra frames' },
  [CUES.DRAMATIC_FINAL]: { icon: '🎉', label: 'final, the hard way' },
  [CUES.WALK_OFF]: { icon: '🚶', label: 'walk-off' },
  [CUES.PHOTO_FINISH]: { icon: '🔬', label: 'photo finish' },
  [CUES.MILESTONE_DRAMA]: { icon: '💎', label: 'this game just got real' },
}

// prev/curr shape: { home_score, away_score, status: 'pre'|'live'|'final', went_to_ot }
// Returns an array of triggered cue keys (0, 1, or more -- same tick
// can trigger multiple, exactly as the live version allows).
export function detectCueTransitions(prev, curr) {
  const cues = []
  if (!prev) return cues

  if (curr.status === 'live' && prev.status === 'live' &&
      curr.home_score !== null && prev.home_score !== null) {
    const prevDiff = prev.home_score - prev.away_score
    const diff = curr.home_score - curr.away_score

    // Lead change: sign flipped (and it wasn't already 0-0)
    if (prevDiff !== 0 && diff !== 0 && Math.sign(prevDiff) !== Math.sign(diff)) {
      cues.push(CUES.LEAD_CHANGE)
    }

    // Comeback: the trailing margin shrank by 3+ in one tick
    const prevMargin = Math.abs(prevDiff)
    const margin = Math.abs(diff)
    if (prevMargin - margin >= 3 && margin > 0) {
      cues.push(CUES.COMEBACK)
    }

    // Blowout developing: margin crosses 8+ and is still growing
    if (margin >= 8 && margin > prevMargin) {
      cues.push(CUES.BLOWOUT)
    }
  }

  // Extra frames just started (went_to_ot flips false -> true)
  if (!prev.went_to_ot && curr.went_to_ot) {
    cues.push(CUES.EXTRA_FRAMES)
  }

  // Just went final, and it went the distance
  if (prev.status !== 'final' && curr.status === 'final' && curr.went_to_ot) {
    cues.push(CUES.DRAMATIC_FINAL)
  }

  // Walk-off: game just went final, and the immediately-prior live
  // state was tied or had the OPPOSITE team ahead -- a last-moment
  // win, not a lead the winner already held. Not mutually exclusive
  // with DRAMATIC_FINAL -- an extra-innings game can also end this way.
  if (prev.status !== 'final' && curr.status === 'final' &&
      curr.home_score !== null && prev.home_score !== null) {
    const prevDiff = prev.home_score - prev.away_score
    const finalDiff = curr.home_score - curr.away_score
    if (finalDiff !== 0 && (prevDiff === 0 || Math.sign(prevDiff) !== Math.sign(finalDiff))) {
      cues.push(CUES.WALK_OFF)
    }

    // Photo finish: ended with the smallest possible real margin.
    if (Math.abs(finalDiff) === 1) {
      cues.push(CUES.PHOTO_FINISH)
    }
  }

  // Milestone drama: THIS game's own real drama_peak crosses into the
  // top tier (>=80, "fire" -- DeskCard's own real dramaTier threshold,
  // reused verbatim) for the first time. Undefined-safe: drama_peak
  // isn't part of the archive-reconstruction state shape (Game Symphony
  // Archive), so this simply never fires there rather than needing a
  // separate code path.
  if (typeof prev.drama_peak === 'number' && typeof curr.drama_peak === 'number' &&
      prev.drama_peak < 80 && curr.drama_peak >= 80) {
    cues.push(CUES.MILESTONE_DRAMA)
  }

  return cues
}

// Runs detectCueTransitions across a full real state sequence (ordered
// oldest to newest), returning every triggered cue with its index in
// the sequence -- the shared building block both the live poller (one
// tick at a time) and a full-game reconstruction (all ticks at once)
// use.
export function detectCueSequence(states) {
  const events = []
  for (let i = 1; i < states.length; i++) {
    const cues = detectCueTransitions(states[i - 1], states[i])
    for (const cue of cues) events.push({ cue, index: i })
  }
  return events
}
