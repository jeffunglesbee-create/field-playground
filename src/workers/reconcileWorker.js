// Runs off the main thread. Receives { prev, next } game arrays from
// two successive deskStore poll snapshots, computes which games changed,
// posts the diff back. Deliberately pure -- no Solid imports, no DOM;
// a worker can't reach either, which is exactly the constraint
// WorkerBridgeDemo is testing: can the reconcile computation itself
// (not just the fetch) move off-thread, with only the diff crossing
// back over postMessage into a createSignal.
self.onmessage = (e) => {
  const { prev, next } = e.data
  const start = performance.now()
  const prevById = new Map((prev ?? []).map(g => [g.id, g]))
  const nextById = new Map((next ?? []).map(g => [g.id, g]))
  const changes = []

  for (const [id, g] of nextById) {
    const p = prevById.get(id)
    if (!p) {
      changes.push({ id, type: 'added', label: `${g.away} @ ${g.home}` })
      continue
    }
    if (p.home_score !== g.home_score || p.away_score !== g.away_score) {
      changes.push({
        id,
        type: 'score',
        label: `${g.away} @ ${g.home}`,
        from: `${p.away_score ?? '—'}-${p.home_score ?? '—'}`,
        to: `${g.away_score ?? '—'}-${g.home_score ?? '—'}`,
      })
    }
    if (!p.finalized_at && g.finalized_at) {
      changes.push({ id, type: 'finalized', label: `${g.away} @ ${g.home}` })
    }
  }
  for (const [id, p] of prevById) {
    if (!nextById.has(id)) changes.push({ id, type: 'removed', label: `${p.away} @ ${p.home}` })
  }

  self.postMessage({
    changes,
    computedAt: Date.now(),
    computeMs: Math.round((performance.now() - start) * 100) / 100,
    prevCount: prevById.size,
    nextCount: nextById.size,
  })
}
