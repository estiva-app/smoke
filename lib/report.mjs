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
