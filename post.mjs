/**
 * Put a run's result on a pull request, as `/land` does after a deploy: each app's version, every step, and a
 * screenshot of each failed one.
 *
 *   node post.mjs <out/<time>|latest> --pr estiva-app/leaf#140             comment on that pull request
 *   node post.mjs latest --pr estiva-app/leaf#140 --note what-land-did.md  with /land's reading of a failure under it
 *   node post.mjs latest --dry                                            print the comment, post nothing
 *
 * Screenshots go to the private repository estiva-app/smoke-runs, under the run's time, and the comment links them:
 * they show production as the test accounts see it, the company team's rooms included, so they are never public, and
 * only the organisation's members can open them. Prints the comment's address.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'

const SELF = 'estiva-app/smoke'
const SHOTS = 'estiva-app/smoke-runs'
const here = new URL('.', import.meta.url).pathname

const args = process.argv.slice(2)
let dir = args[0]
const pr = args.includes('--pr') ? args[args.indexOf('--pr') + 1] : null
const note = args.includes('--note') ? readFileSync(args[args.indexOf('--note') + 1], 'utf8').trim() : ''
const dry = args.includes('--dry')
if (!dir || (!pr && !dry) || (pr && !/^[\w.-]+\/[\w.-]+#\d+$/.test(pr))) {
  console.error('usage: node post.mjs <out/<time>|latest> (--pr <owner/repo#n> | --dry) [--note <file>]')
  process.exit(2)
}
if (dir === 'latest') {
  const runs = readdirSync(join(here, 'out')).filter((name) => existsSync(join(here, 'out', name, 'result.json'))).sort()
  dir = join(here, 'out', runs.at(-1))
}
const result = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'))
// The comment is public: screenshot lines name the file only (the folder is this machine's), and the run's relay
// request counts, which nobody reading a pull request needs, stay in out/ (busy answers and leftovers are in the verdict).
const text = readFileSync(join(dir, 'result.txt'), 'utf8')
  .trim()
  .replace(/(screenshot: )\S*\/([^/\s]+\.png)/g, '$1$2')
  .replace(/^\d+ s; relay requests .*$/m, `${result.seconds} s`)
const stamp = basename(dir)

const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

/** Upload one screenshot to the private repository and return the address members open it at. */
function upload(file) {
  const path = `${stamp}/${basename(file)}`
  const url = `https://github.com/${SHOTS}/blob/main/${path}`
  try {
    // Posted before (the same run again, with a note): the screenshot is already there.
    gh('api', `repos/${SHOTS}/contents/${path}`, '--jq', '.sha')
    return url
  } catch {}
  const body = join(tmpdir(), `smoke-upload-${process.pid}.json`)
  writeFileSync(body, JSON.stringify({ message: `${stamp}: ${basename(file)}`, content: readFileSync(file).toString('base64') }))
  try {
    gh('api', '-X', 'PUT', `repos/${SHOTS}/contents/${path}`, '--input', body, '--jq', '.content.path')
  } finally {
    rmSync(body, { force: true })
  }
  return url
}

const steps = result.flows.flatMap((flow) => flow.steps.map((step) => ({ ...step, flow })))
const failed = steps.filter((step) => step.status === 'failed')
const known = steps.filter((step) => step.status === 'known')
const notServed = (result.expected ?? []).filter((e) => !e.ok)

const verdict = result.error
  ? `did not finish: ${result.error}`
  : result.ok
    ? `passed${known.length ? `, ${known.length} known` : ''}`
    : `**failed**: ${failed.length} step${failed.length === 1 ? '' : 's'}${result.busy.length ? `, ${result.busy.length} busy answers` : ''}${result.leftovers.length ? ', something left behind' : ''}`
const lines = [`### Smoke test on production — ${verdict}`, '']
const short = (commit) => String(commit).slice(0, 7)
lines.push(`Versions tested: ${Object.entries(result.versions).map(([app, commit]) => `${app} \`${short(commit)}\``).join(' · ')}${result.served.length ? ` — served to the test only: ${result.served.join(', ')}` : ''}`)
for (const e of result.expected ?? []) lines.push(`- ${e.ok ? '✅' : '❌'} ${e.app} serves \`${short(e.commit)}\` or later${e.ok ? '' : `: ${e.error}`}`)
lines.push('')
// /land's reading comes first: whether anything needs a person, before the detail of what failed.
if (note) lines.push(note, '')

if (notServed.length) lines.push('Nothing was tested: the deploy under test was not served.', '')
if (failed.length) {
  lines.push('**Failed**', '')
  for (const step of failed) {
    lines.push(`- Flow ${step.flow.id} (${step.flow.title}): **${step.name}** — ${step.error ?? ''}`)
    if (step.screenshot && existsSync(step.screenshot)) lines.push(`  [Screenshot](${dry ? step.screenshot : upload(step.screenshot)}) (private)`)
  }
  lines.push('')
}
if (known.length) {
  lines.push('**Known** (an open bug; does not fail the run)', '')
  for (const step of known) lines.push(`- Flow ${step.flow.id}: ${step.name} — [${step.known.title}](${step.known.link})`)
  lines.push('')
}
const noted = steps.filter((step) => step.note)
for (const step of noted) lines.push(`- Note, flow ${step.flow.id}: ${step.note}`)
if (noted.length) lines.push('')
lines.push('<details><summary>Every step</summary>', '', '```', text, '```', '', '</details>')
lines.push('', `<sub>[The smoke test](https://github.com/${SELF}) walks the core flows in [CORE-FLOWS.md](https://github.com/${SELF}/blob/main/CORE-FLOWS.md) as Smoke Test 1 and 2.</sub>`)
const comment = lines.join('\n')

if (dry) {
  console.log(comment)
  process.exit(0)
}
const [repo, number] = pr.split('#')
const file = join(tmpdir(), `smoke-comment-${process.pid}.md`)
writeFileSync(file, comment)
try {
  console.log(gh('pr', 'comment', number, '-R', repo, '--body-file', file))
} finally {
  rmSync(file, { force: true })
}
