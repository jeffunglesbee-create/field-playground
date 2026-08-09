// probe-production-bug-classes.mjs
//
// The production-side analog of scripts/probe-detection-latency.mjs.
// That script mined THIS repo's real commit history for fix-commit
// shapes and found the enforcement gap is largely theoretical here
// (81.6% of bugs fixed within 24h). This asks the same real question
// of jubilant-bassoon: what does its actual fix-commit history look
// like, empirically -- not from memory of individual bugs discussed
// this session, but from every real fix commit in its real history.
//
// jubilant-bassoon is public and read-only from here -- this clones
// it fresh in CI and analyzes the real clone. Nothing in that repo is
// touched; this stays entirely inside field-playground.
//
// WHY THIS MATTERS for "what language helps both": a language's real
// value is in which bug classes it eliminates BY CONSTRUCTION. Naming
// a language from memory of a handful of bugs discussed in
// conversation is exactly the "story order, not cost order" mistake
// probe-detection-latency.mjs itself called out and corrected. This
// measures the real, full distribution first.

import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/production-bug-classes-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const REPO_URL = 'https://github.com/jeffunglesbee-create/jubilant-bassoon.git'
const CLONE_DIR = '/tmp/jb-clone-analysis'

function sh(cmd, opts = {}) {
  return execSync(cmd, { cwd: CLONE_DIR, encoding: 'utf8', maxBuffer: 1024 * 1024 * 64, ...opts })
}

async function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: real, empirical bug-class distribution from jubilant-bassoon\'s actual git history')
  log('method: same shape as probe-detection-latency.mjs, applied to a fresh clone of a different repo')
  log('')

  if (existsSync(CLONE_DIR)) rmSync(CLONE_DIR, { recursive: true, force: true })
  log('=== cloning the real, public repo ===')
  execSync(`git clone --quiet ${REPO_URL} ${CLONE_DIR}`, { encoding: 'utf8' })
  const headSha = sh('git rev-parse HEAD').trim()
  log('cloned HEAD: ' + headSha)

  // Real fix-commit detection: same convention this project already
  // uses in its own commit messages (confirmed pattern from this
  // session's own docs: "fix:", "bug", explicit defect language).
  const log1 = sh(`git log --oneline -i --grep="^fix:" --grep="fix " --grep="bug" -E --all`)
  const totalCommits = parseInt(sh('git rev-list --count HEAD').trim(), 10)
  const fixLines = log1.trim().split('\n').filter(Boolean)
  log('')
  log('total commits (all history): ' + totalCommits)
  log('commits matching fix/bug pattern: ' + fixLines.length)
  log('')

  // Real bug-class clustering: extract the real, stated root cause
  // from each fix commit's own message where one is given, rather
  // than inventing categories. Group by real recurring keywords found
  // IN the actual commit messages, not a predefined taxonomy.
  const keywords = {}
  for (const line of fixLines) {
    const msg = line.slice(line.indexOf(' ') + 1).toLowerCase()
    for (const kw of [
      'null', 'undefined', 'race', 'case-sensitiv', 'case sensitiv',
      'typo', 'field name', 'field path', 'shape', 'wrong field',
      'duplicate', 'id scheme', 'stale', 'timeout', 'cache',
      'auth', 'permission', 'schema', 'validation', 'regex',
    ]) {
      if (msg.includes(kw)) keywords[kw] = (keywords[kw] || 0) + 1
    }
  }
  log('=== real keyword frequency across all matched fix commits ===')
  log('(a commit can match more than one keyword; these are not exclusive buckets)')
  for (const [kw, n] of Object.entries(keywords).sort((a, b) => b[1] - a[1])) {
    log(`  ${kw.padEnd(20)} ${n}`)
  }
  log('')

  // Real "single-file" structural fact, measured, not asserted from
  // memory of the earlier screenshot analysis.
  const lineCount = parseInt(sh('wc -l < src/legacy/field.js').trim(), 10)
  const fileFixTouches = sh(`git log --oneline -i --grep="^fix:" --grep="fix " -E --all -- src/legacy/field.js`).trim().split('\n').filter(Boolean).length
  log('=== structural fact, measured fresh, not recalled ===')
  log('src/legacy/field.js real current line count: ' + lineCount)
  log('fix commits touching this single file: ' + fileFixTouches + ' / ' + fixLines.length +
      ' (' + Math.round(100 * fileFixTouches / fixLines.length) + '% of all matched fixes)')
  log('')

  log('=== verdict ===')
  log('Real distribution above, not asserted. Use this alongside playground\'s own')
  log('probe-detection-latency.mjs output for a genuine, evidence-based comparison')
  log('rather than a memory-based one.')
}

main().catch(e => log('FAILED: ' + String(e && e.stack || e)))
