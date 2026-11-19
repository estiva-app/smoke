/** Versions in, a result out: what the run tested and how each step went. */
import { execFileSync } from 'node:child_process'

export const VERSIONED = { peek: 'https://peek.estiva.app', ship: 'https://ship.estiva.app', leaf: 'https://leaf.estiva.app', id: 'https://id.estiva.app' }

/** Each app's `version.json` commit (peek#671, ship#422, leaf#138, estiva-id#102). */
export async function versions() {
  const out = {}
  await Promise.all(
    Object.entries(VERSIONED).map(async ([app, origin]) => {
      try {
        const response = await fetch(`${origin}/version.json`, { cache: 'no-store' })
        out[app] = response.ok ? ((await response.json()).commit ?? 'unknown') : `HTTP ${response.status}`
      } catch (error) {
        out[app] = `unreachable: ${error.message}`
      }
    }),
  )
  return Object.fromEntries(Object.keys(VERSIONED).map((app) => [app, out[app]]))
}

const REPOS = { peek: 'peek', ship: 'ship', leaf: 'leaf', id: 'estiva-id' }

/** Whether `served` is `commit` or comes after it on its repository, by GitHub's compare (the repos are public). */
function includes(app, commit, served) {
  if (served.startsWith(commit) || commit.startsWith(served)) return true
  if (!/^[0-9a-f]{7,40}$/.test(served)) return false
  try {
    const status = execFileSync('gh', ['api', `repos/estiva-app/${REPOS[app]}/compare/${commit}...${served}`, '--jq', '.status'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30_000,
    }).trim()
    return status === 'identical' || status === 'ahead'
  } catch {
    return false
  }
}

/**
 * The run's first step when `/land` names the deploy under test (`--expect peek=<merge sha>`): wait until each named
 * app serves that commit or a later one, so the run never passes against the old build. One entry per app.
 */
export async function awaitServed(expect, { timeoutMs = 15 * 60_000, everyMs = 20_000 } = {}) {
  const began = Date.now()
  const pending = new Map(Object.entries(expect))
  const out = []
  for (;;) {
    const now = await versions()
    for (const [app, commit] of pending) {
      if (!REPOS[app]) {
        out.push({ app, commit, served: null, ok: false, error: `no version to read for "${app}" (one of ${Object.keys(REPOS).join(', ')})` })
        pending.delete(app)
      } else if (includes(app, commit, now[app])) {
        out.push({ app, commit, served: now[app], ok: true, waitedSeconds: Math.round((Date.now() - began) / 1000) })
        pending.delete(app)
      }
    }
    if (!pending.size) return out
    if (Date.now() - began > timeoutMs) {
      for (const [app, commit] of pending)
        out.push({ app, commit, served: now[app], ok: false, error: `still serving ${String(now[app]).slice(0, 7)} after ${Math.round(timeoutMs / 60_000)} min` })
      return out
    }
    await new Promise((done) => setTimeout(done, everyMs))
  }
}

/**
 * Whether the Ship issue at `addr` is still open, read with the agent's `ship` CLI. A known failure stays known only
 * while its issue is open; `null` when it cannot be read (no CLI here), which keeps it known and says so.
 */
export function issueOpen(addr) {
  try {
    const show = JSON.parse(execFileSync('ship', ['show', addr], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60_000 }))
    return !/^(done|cancelled)$/i.test(show.status ?? '')
  } catch {
    return null
  }
}

/** One line per step, then the totals: what a person reads on the pull request. */
export function summary(result) {
  const mark = { passed: 'PASS', failed: 'FAIL', known: 'KNOWN', skipped: 'SKIP' }
  const lines = [`Smoke test ${result.startedAt} — ${result.ok ? 'passed' : 'FAILED'}`]
  lines.push(`Versions: ${Object.entries(result.versions).map(([app, commit]) => `${app} ${String(commit).slice(0, 7)}`).join(', ')}${result.served.length ? ` (served locally: ${result.served.join(', ')})` : ''}`)
  if (result.versionsChanged) {
    const moved = Object.entries(result.versionsAfter).filter(([app, commit]) => commit !== result.versions[app])
    lines.push(`Deployed during the run: ${moved.map(([app, commit]) => `${app} ${String(result.versions[app]).slice(0, 7)} → ${String(commit).slice(0, 7)}`).join(', ')}; later steps may have run on the newer version, so run again to be sure.`)
  }
  if (result.expected?.length) {
    lines.push('\n0. The deploy under test is served')
    for (const e of result.expected)
      lines.push(`  ${e.ok ? 'PASS' : 'FAIL'}  ${e.app} serves ${e.commit.slice(0, 7)} or later${e.ok ? ` (${String(e.served).slice(0, 7)}, after ${e.waitedSeconds} s)` : `\n        ${e.error}`}`)
  }
  for (const flow of result.flows) {
    lines.push(`\n${flow.id}. ${flow.title}`)
    for (const step of flow.steps) {
      let line = `  ${mark[step.status]}  ${step.name} (${(step.ms / 1000).toFixed(1)} s)`
      if (step.error) line += `\n        ${step.error}`
      if (step.known) line += `\n        known: ${step.known.title} — ${step.known.link}${step.known.note ? ` (${step.known.note})` : ''}`
      if (step.note) line += `\n        note: ${step.note}`
      if (step.screenshot) line += `\n        screenshot: ${step.screenshot}`
      lines.push(line)
    }
  }
  lines.push(`\n${result.seconds} s; relay requests ${result.requests.map((r) => `Smoke Test ${r.n}${r.fresh ? ' (new browser)' : ''}: ${r.http} HTTP + ${r.frames} socket frames${r.pacedSeconds ? `, ${r.pacedSeconds} s held back to stay under the relay's limit` : ''}`).join(', ')}; busy answers: ${result.busy.length}`)
  for (const busy of result.busy) lines.push(`  busy: Smoke Test ${busy.n} ${busy.at} ${busy.what}`)
  for (const stuck of result.stuck ?? []) lines.push(`  a write that never reported its end: ${stuck}`)
  lines.push(result.leftovers.length
    ? `Left behind: ${result.leftovers.join('; ')}`
    : 'Left behind: nothing (the run\'s issue is deleted, in the QA team\'s Issues › Archived › Deleted)')
  return lines.join('\n')
}
