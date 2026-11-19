/**
 * Put a run's result on a pull request, as `/land` does after a deploy: each app's version, every step, and a
 * screenshot of each failed one.
 *
 *   node post.mjs <out/<time>|latest> --pr estiva-app/leaf#140             comment on that pull request
 *   node post.mjs latest --pr estiva-app/leaf#140 --note what-land-did.md  with /land's reading of a failure under it
 *   node post.mjs latest --dry                                            print the comment, post nothing
 *
 * Screenshots go to this repository's `runs` branch (made on first use, with no history of the code), under the run's
 * time, and the comment shows them from there. Prints the comment's address.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'

const SELF = 'estiva-app/smoke'
const BRANCH = 'runs'
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
// Screenshot lines name the file only: the folder is this machine's, and the comment is public.
const text = readFileSync(join(dir, 'result.txt'), 'utf8').trim().replace(/(screenshot: )\S*\/([^/\s]+\.png)/g, '$1$2')
const stamp = basename(dir)

const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

/** The `runs` branch, made once as a commit with no parent, so screenshots never mix with the code's history. */
function ensureBranch() {
  try {
    gh('api', `repos/${SELF}/branches/${BRANCH}`, '--jq', '.name')
    return
  } catch {}
  const blob = gh('api', `repos/${SELF}/git/blobs`, '-f', 'content=Screenshots of failed smoke-test steps, one folder per run (post.mjs).\n', '-f', 'encoding=utf-8', '--jq', '.sha')
  const tree = gh('api', `repos/${SELF}/git/trees`, '-f', 'tree[][path]=README.md', '-f', 'tree[][mode]=100644', '-f', 'tree[][type]=blob', '-f', `tree[][sha]=${blob}`, '--jq', '.sha')
  const commit = gh('api', `repos/${SELF}/git/commits`, '-f', 'message=Screenshots of failed smoke-test steps', '-f', `tree=${tree}`, '--jq', '.sha')
  gh('api', `repos/${SELF}/git/refs`, '-f', `ref=refs/heads/${BRANCH}`, '-f', `sha=${commit}`)
}

/** Upload one screenshot and return the address it is shown from. */
function upload(file) {
  const path = `${stamp}/${basename(file)}`
  const url = `https://raw.githubusercontent.com/${SELF}/${BRANCH}/${path}`
  try {
    // Posted before (the same run again, with a note): the screenshot is already there.
    gh('api', `repos/${SELF}/contents/${path}?ref=${BRANCH}`, '--jq', '.sha')
    return url
  } catch {}
  const body = join(tmpdir(), `smoke-upload-${process.pid}.json`)
  writeFileSync(body, JSON.stringify({ message: `${stamp}: ${basename(file)}`, branch: BRANCH, content: readFileSync(file).toString('base64') }))
  try {
    gh('api', '-X', 'PUT', `repos/${SELF}/contents/${path}`, '--input', body, '--jq', '.content.path')
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

if (notServed.length) lines.push('Nothing was tested: the deploy under test was not served.', '')
if (failed.length) {
  if (!dry) ensureBranch()
  lines.push('**Failed**', '')
  for (const step of failed) {
    lines.push(`- Flow ${step.flow.id} (${step.flow.title}): **${step.name}** — ${step.error ?? ''}`)
    if (step.screenshot && existsSync(step.screenshot)) lines.push('', `  ![${step.name}](${dry ? step.screenshot : upload(step.screenshot)})`, '')
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
if (note) lines.push(note, '')
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
