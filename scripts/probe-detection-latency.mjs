#!/usr/bin/env node
// How long does a bug survive in this repo before anyone notices?
//
// WHY THIS EXISTS. The best idea to come out of the 2026-08-08 architecture
// exchange was a filter: "enforce only what's expensive to discover late." It
// is a genuinely better rule than "detect everything mechanically detectable"
// -- a hardcoded hex that renders fine in both themes costs nothing, while a
// silent resource crash or a schema drift is expensive precisely because it is
// invisible until it isn't.
//
// But as stated it is TASTE. Nothing in it is checkable, so it can justify any
// priority order after the fact. This makes it data.
//
// Two measurements, both from git history alone -- no relay, no network:
//
//   A. INTRODUCE -> FIX LATENCY, per fix commit. Blame the lines a fix
//      changed back to the commit that last wrote them. That is how long the
//      defect sat there. Grouped by file and by area, it says which parts of
//      this codebase hide their bugs.
//
//   B. KNOW -> GUARD LAG, per CI guard. Each of the guards in this repo was
//      written after the same bug class was hand-caught several times. The
//      claim is that the lag between "known" and "guarded" is a separate
//      problem from "nobody knew." This counts the hand-fixes that preceded
//      each guard and measures the gap.
//
// HONEST LIMITS, stated here rather than discovered later:
//   - git blame attributes to LAST TOUCH, not to the commit that introduced
//     the defect. A refactor that moved a line resets it. So latencies here
//     are LOWER BOUNDS -- the real numbers are worse, never better.
//   - "fix commit" is a message-pattern heuristic. A fix committed under a
//     feature message is invisible to this.
//   - Bug-class attribution in (B) is keyword-based against commit subjects,
//     so it is indicative rather than exact. Counts are small enough to eyeball
//     from the printed list.

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

mkdirSync('outbox', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outPath = 'outbox/detection-latency-' + stamp + '.txt'
const out = []
const log = s => { out.push(s); console.log(s); try { writeFileSync(outPath, out.join('\n')) } catch {} }

const git = (...args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch { return '' }
}

const DAY = 86400000
const days = ms => ms / DAY

// A fix commit says it is fixing something. Deliberately narrow: broadening
// this to any commit touching a bug would swallow feature work and inflate the
// sample with things that were never defects.
const FIX_RE = /^(fix|bugfix)(\(|:|\s)|^revert|(^|\s)(fixes|fixed|broken|regression|mis(label|read|match)|wrong|corrupt)/i

function commitList() {
  const raw = git('log', '--no-merges', '--format=%H\x1f%at\x1f%s')
  return raw.split('\n').filter(Boolean).map(line => {
    const [sha, at, subject] = line.split('\x1f')
    return { sha, at: Number(at) * 1000, subject: subject ?? '' }
  })
}

// Lines a commit REMOVED or REPLACED, keyed by file, expressed as ranges in the
// PARENT. Those are the lines that were wrong; blaming them says when they were
// written. Added-only hunks are skipped -- new lines have no history to blame.
function removedRanges(sha) {
  const diff = git('show', '--unified=0', '--no-color', '--format=', sha)
  const byFile = new Map()
  let file = null
  for (const line of diff.split('\n')) {
    if (line.startsWith('--- a/')) { file = line.slice(6); continue }
    if (line.startsWith('--- /dev/null')) { file = null; continue }
    if (line.startsWith('+++ ')) continue
    const m = /^@@ -(\d+)(?:,(\d+))? \+/.exec(line)
    if (m && file) {
      const start = Number(m[1])
      const count = m[2] === undefined ? 1 : Number(m[2])
      if (count > 0) {
        if (!byFile.has(file)) byFile.set(file, [])
        byFile.get(file).push([start, start + count - 1])
      }
    }
  }
  return byFile
}

// Newest introducing commit among the blamed lines. Newest rather than oldest
// on purpose: a fix usually corrects the most recent write, and taking the
// oldest would attribute the defect to whoever first created the file.
function newestBlamedCommit(parentSha, file, ranges, commitTimes) {
  const args = ['blame', '--porcelain', parentSha, '--']
  const lineArgs = []
  for (const [a, b] of ranges.slice(0, 40)) lineArgs.push('-L', `${a},${b}`)
  const raw = git('blame', '--porcelain', ...lineArgs, parentSha, '--', file)
  if (!raw) return null
  let newest = null
  for (const line of raw.split('\n')) {
    const m = /^([0-9a-f]{40}) /.exec(line)
    if (!m) continue
    const t = commitTimes.get(m[1])
    if (t == null) continue
    if (!newest || t > newest.at) newest = { sha: m[1], at: t }
  }
  return newest
}

function stats(values) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const q = p => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]
  return { n: s.length, min: s[0], p25: q(0.25), median: q(0.5), p75: q(0.75), p90: q(0.9), max: s[s.length - 1] }
}

const fmt = d => (d < 1 / 24 ? `${Math.round(d * 24 * 60)}m` : d < 1 ? `${(d * 24).toFixed(1)}h` : `${d.toFixed(1)}d`)

// Guards currently in this repo, with the keywords that identify the bug class
// each one covers. Keyword sets are deliberately visible so a reader can judge
// the attribution rather than trust it.
const GUARDS = [
  { file: 'scripts/check-resource-safety.mjs', label: 'resource re-throw',
    re: /resource|safeResource|createResource|re-?throw|error state|errored/i },
  { file: 'scripts/check-unread-memos.mjs', label: 'unread createMemo',
    re: /createMemo|unread memo|memo/i },
  { file: 'scripts/check-localstorage-guards.mjs', label: 'unguarded localStorage',
    re: /localstorage|storage guard|quota/i },
  { file: 'scripts/check-webgl-disposal.mjs', label: 'WebGL disposal',
    re: /webgl|dispose|renderer leak|three\.js/i },
  { file: 'scripts/check-anomaly-invariants.mjs', label: 'anomaly analysis invariants',
    re: /anomal|quantile|percentile|above-typical|tier-top|baseline/i },
]

function firstCommitTouching(path) {
  const raw = git('log', '--reverse', '--format=%H\x1f%at\x1f%s', '--', path)
  const line = raw.split('\n').filter(Boolean)[0]
  if (!line) return null
  const [sha, at, subject] = line.split('\x1f')
  return { sha, at: Number(at) * 1000, subject }
}

function main() {
  log('probe_at: ' + new Date().toISOString())
  log('purpose: turn "enforce only what is expensive to discover late" from taste into data.')
  log('method: blame the lines each fix commit changed back to when they were written.')
  log('')

  const commits = commitList()
  const commitTimes = new Map(commits.map(c => [c.sha, c.at]))
  const fixes = commits.filter(c => FIX_RE.test(c.subject))
  log(`total non-merge commits: ${commits.length}`)
  log(`fix commits matched:     ${fixes.length}  (${((fixes.length / commits.length) * 100).toFixed(1)}%)`)
  log('')

  // ---- A. introduce -> fix latency -------------------------------------
  const records = []
  for (const fix of fixes) {
    const parent = git('rev-parse', `${fix.sha}^`).trim()
    if (!parent) continue
    const byFile = removedRanges(fix.sha)
    for (const [file, ranges] of byFile) {
      if (!/\.(js|jsx|mjs|css|json|yml|yaml)$/.test(file)) continue
      const intro = newestBlamedCommit(parent, file, ranges, commitTimes)
      if (!intro || intro.sha === fix.sha) continue
      const latency = days(fix.at - intro.at)
      if (latency < 0) continue
      records.push({ file, latency, fix, intro })
    }
  }

  log('=== A. INTRODUCE -> FIX LATENCY ===')
  log(`blamed file-changes analysed: ${records.length}`)
  const all = stats(records.map(r => r.latency))
  if (all) {
    log(`  min ${fmt(all.min)} | p25 ${fmt(all.p25)} | median ${fmt(all.median)} | p75 ${fmt(all.p75)} | p90 ${fmt(all.p90)} | max ${fmt(all.max)}`)
  }
  log('')

  // Same-day fixes are the cheap ones. The tail is what the filter cares about.
  const sameDay = records.filter(r => r.latency < 1).length
  const overWeek = records.filter(r => r.latency >= 7).length
  log(`  fixed within 24h:  ${sameDay} / ${records.length} (${((sameDay / records.length) * 100).toFixed(1)}%)`)
  log(`  survived >= 7 days: ${overWeek} / ${records.length} (${((overWeek / records.length) * 100).toFixed(1)}%)`)
  log('')

  log('  --- slowest 15 individual defects (the tail the filter is about) ---')
  for (const r of [...records].sort((a, b) => b.latency - a.latency).slice(0, 15)) {
    log(`  ${fmt(r.latency).padStart(7)}  ${r.file}`)
    log(`           introduced ${r.intro.sha.slice(0, 8)} -> fixed ${r.fix.sha.slice(0, 8)}: ${r.fix.subject.slice(0, 78)}`)
  }
  log('')

  // Per-area: which parts of the codebase hide defects longest. Median, not
  // mean -- one ancient fix should not crown an area.
  const byArea = new Map()
  const areaOf = f =>
    f.startsWith('src/data/') ? 'src/data' :
    f.startsWith('src/components/') ? 'src/components' :
    f.startsWith('scripts/') ? 'scripts' :
    f.startsWith('.github/') ? '.github' :
    f.startsWith('docs/') ? 'docs' : 'other'
  for (const r of records) {
    const a = areaOf(r.file)
    if (!byArea.has(a)) byArea.set(a, [])
    byArea.get(a).push(r.latency)
  }
  log('  --- by area (median latency, n) ---')
  for (const [area, vals] of [...byArea.entries()].sort((a, b) => stats(b[1]).median - stats(a[1]).median)) {
    const s = stats(vals)
    log(`  ${area.padEnd(16)} median ${fmt(s.median).padStart(7)}   p90 ${fmt(s.p90).padStart(7)}   n=${s.n}`)
  }
  log('')

  // Per-file, restricted to files with enough fixes to mean something.
  const byFile = new Map()
  for (const r of records) {
    if (!byFile.has(r.file)) byFile.set(r.file, [])
    byFile.get(r.file).push(r.latency)
  }
  const repeat = [...byFile.entries()].filter(([, v]) => v.length >= 3)
  log(`  --- files fixed 3+ times, by median latency (${repeat.length} files) ---`)
  for (const [file, vals] of repeat.sort((a, b) => stats(b[1]).median - stats(a[1]).median).slice(0, 12)) {
    const s = stats(vals)
    log(`  ${fmt(s.median).padStart(7)} median   n=${String(s.n).padStart(3)}   ${file}`)
  }
  log('')

  // ---- B. know -> guard lag --------------------------------------------
  log('=== B. KNOW -> GUARD LAG (per existing CI guard) ===')
  log('For each guard: when it landed, and how many fix commits of that class preceded it.')
  log('Keyword attribution -- indicative, not exact. Preceding subjects are printed so')
  log('the attribution can be judged rather than trusted.')
  log('')
  for (const g of GUARDS) {
    const born = firstCommitTouching(g.file)
    if (!born) { log(`  ${g.label}: guard file not found in history (${g.file})`); log(''); continue }
    const priorFixes = fixes.filter(c => c.at < born.at && g.re.test(c.subject))
    log(`  ${g.label}`)
    log(`    guard landed: ${new Date(born.at).toISOString().slice(0, 10)}  (${born.sha.slice(0, 8)})`)
    log(`    matching fix commits BEFORE the guard: ${priorFixes.length}`)
    for (const p of priorFixes.slice(-6)) {
      log(`      ${new Date(p.at).toISOString().slice(0, 10)}  ${p.subject.slice(0, 74)}`)
    }
    if (priorFixes.length >= 2) {
      const firstKnown = priorFixes[priorFixes.length - 1].at
      const lag = days(born.at - firstKnown)
      log(`    lag from FIRST matching fix to guard: ${fmt(lag)}`)
    }
    const afterFixes = fixes.filter(c => c.at > born.at && g.re.test(c.subject))
    // A fix AFTER a guard lands is ambiguous and must not be printed as a
    // failure. It is either a recurrence the guard missed, OR a defect the
    // guard itself caught -- which is the guard succeeding. Only reading the
    // commit distinguishes them, so say that instead of implying the worse one.
    log(`    matching fix commits AFTER the guard:  ${afterFixes.length}` +
        (afterFixes.length ? '   <- read these: a guard-caught defect looks identical to a miss here' : ''))
    for (const a of afterFixes.slice(0, 3)) {
      log(`      ${new Date(a.at).toISOString().slice(0, 10)}  ${a.subject.slice(0, 74)}`)
    }
    log('')
  }

  // ---- verdict -----------------------------------------------------------
  log('=== VERDICT ===')
  if (!all) { log('No blamed records -- nothing to conclude.'); return }
  const pctSameDay = sameDay / records.length
  if (pctSameDay > 0.8) {
    log(`${(pctSameDay * 100).toFixed(0)}% of defects here are fixed within a day, and the median is ${fmt(all.median)}.`)
    log('On this evidence the enforcement problem is largely THEORETICAL in this repo:')
    log('bugs are not surviving long enough to be expensive. The honest read is that most')
    log('of the proposed process infrastructure should be dropped, and effort should go to')
    log('the specific tail cases listed above rather than to blanket automation.')
  } else {
    log(`Median ${fmt(all.median)}, p90 ${fmt(all.p90)}, and ${overWeek} defect(s) survived a week or more.`)
    log('There is a real tail. Enforcement is worth building -- but scoped to the areas and')
    log('files at the top of the lists above, not applied uniformly.')
  }
  log('')
  log('Remember the bias: git blame attributes to LAST TOUCH, so every latency here is a')
  log('LOWER bound. The true numbers are worse, never better.')
}

main()
