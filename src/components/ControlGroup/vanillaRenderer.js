// Direct DOM manipulation, modeled on production's actual field.js
// architecture -- not a strawman. Confirmed via CODE_MAP.json (jubilant-
// bassoon): renderCard(enrichedGame, sport) creates a card,
// updateCard(cardEl, enrichedGame) patches an existing one in place, and
// renderAll(skipUnchanged) is gated by a computed per-game render
// signature (_fieldVisibleRenderSignature/_fieldGameRenderPayload) so
// unchanged games cost zero DOM work. This mirrors that shape exactly:
// create-if-missing, skip-if-signature-unchanged, patch-only-changed-
// field if changed, remove-if-gone. Real source lines weren't reachable
// (jubilant-bassoon's index.html is 45k lines, past this session's read
// allowlist) -- the architecture came from CODE_MAP.json's function
// index, which the outline itself confirms (name/params/section), not
// guessed from the name alone.
//
// Imports the same CSS module as ReconcileGameList so the two panels are
// visually identical -- the comparison is mechanism vs mechanism, not
// styling vs styling.
import styles from './ControlGroup.module.css'

export function gameSignature(g) {
  return `${g.home_score}|${g.away_score}|${g.finalized_at}|${g.went_to_ot}`
}

function gameStatus(g) {
  if (g.home_score === null) return 'pre'
  if (g.finalized_at) return g.went_to_ot ? 'final_ot' : 'final'
  return 'live'
}

function scoreText(g) {
  if (g.home_score === null) return '—'
  const status = gameStatus(g)
  const suffix = status === 'final_ot' ? ' F/OT' : status === 'final' ? ' F' : ''
  return `${g.away_score}-${g.home_score}${suffix}`
}

// renderCard -- creates a new card element for a game not yet on screen.
export function renderCard(game) {
  const el = document.createElement('div')
  el.className = styles.row
  el.dataset.gameId = game.id
  el.dataset.sig = gameSignature(game)

  const matchup = document.createElement('span')
  matchup.className = styles.matchup
  matchup.textContent = `${game.away} @ ${game.home}`

  const score = document.createElement('span')
  score.className = styles.score
  score.textContent = scoreText(game)

  el.appendChild(matchup)
  el.appendChild(score)
  return el
}

// updateCard -- patches an EXISTING card in place. Only the score node is
// touched: the matchup (team names) never changes for a given game.id,
// so it's never re-written -- the same "only patch what could differ"
// discipline the real render-signature gate exists to enforce.
export function updateCard(el, game) {
  el.dataset.sig = gameSignature(game)
  el.querySelector(`.${styles.score}`).textContent = scoreText(game)
}

// renderAll(container, games, nodesById, skipUnchanged) -- the gated
// top-level render pass. nodesById is a Map the caller keeps alive
// across calls (this module's equivalent of field.js's own DOM-node
// registry) so identity survives between poll cycles.
export function renderAll(container, games, nodesById) {
  const seen = new Set()
  for (const g of games) {
    seen.add(g.id)
    const existing = nodesById.get(g.id)
    if (!existing) {
      const el = renderCard(g)
      nodesById.set(g.id, el)
      container.appendChild(el)
      continue
    }
    if (existing.dataset.sig === gameSignature(g)) continue // skipUnchanged
    updateCard(existing, g)
  }
  for (const [id, el] of nodesById) {
    if (!seen.has(id)) {
      el.remove()
      nodesById.delete(id)
    }
  }
}
