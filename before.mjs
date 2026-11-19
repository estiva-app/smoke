/**
 * Build one app at a commit, with production's settings, for `run.mjs --serve <app>=<dist>`: the version before a
 * change, when `/land` asks whether a failed step failed there too, or a build with a break put in on purpose.
 *
 *   node before.mjs <peek|ship|leaf> <commit>                 prints the build's folder
 *   node before.mjs <peek|ship|leaf> <commit> --patch <file>  the same commit with a patch applied (a planted break)
 *
 * Each app's source is cloned once into ~/.cache/estiva-smoke/src, and each build kept in ~/.cache/estiva-smoke/builds,
 * so a second ask for the same commit is instant. Only the folder's path goes to stdout; the build's own output goes
 * to stderr. Exit 1 when the build fails.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'

/** Each app's repository, where its build lands, and the settings its deploy workflow builds with. */
const APPS = {
  peek: { repo: 'peek', dist: 'dist', env: { VITE_RELAY_URL: 'https://estiva.estiva.app' } },
  ship: {
    repo: 'ship',
    dist: 'dist/ship',
    env: { RELAY_URL: 'https://estiva.estiva.app', ID_BASE: 'https://id.estiva.app', CLIENT_ID: 'estiva-ship' },
  },
  leaf: {
    repo: 'leaf',
    dist: 'dist',
    env: {
      VITE_ESTIVA_ID_ORIGIN: 'https://id.estiva.app',
      VITE_ESTIVA_ID_CLIENT_ID: 'estiva-leaf',
      VITE_RELAY_URL: 'https://estiva.estiva.app',
    },
  },
}

const [app, ref, ...rest] = process.argv.slice(2)
const patchAt = rest.indexOf('--patch')
const patch = patchAt >= 0 ? resolve(rest[patchAt + 1] ?? '') : null
if (!APPS[app] || !ref || (patchAt >= 0 && !existsSync(patch))) {
  console.error('usage: node before.mjs <peek|ship|leaf> <commit> [--patch <file>]')
  process.exit(2)
}
const { repo, dist, env } = APPS[app]

const cache = join(homedir(), '.cache', 'estiva-smoke')
const src = join(cache, 'src', repo)
const quiet = { stdio: ['ignore', 'ignore', 'inherit'] }
const loud = { stdio: ['ignore', process.stderr, process.stderr] }
const git = (...args) => execFileSync('git', ['-C', src, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()

if (!existsSync(src)) {
  mkdirSync(join(cache, 'src'), { recursive: true })
  execFileSync('git', ['clone', '--quiet', '--filter=blob:none', `https://github.com/estiva-app/${repo}.git`, src], quiet)
}
execFileSync('git', ['-C', src, 'fetch', '--quiet', 'origin'], quiet)
const commit = git('rev-parse', '--verify', `${ref}^{commit}`)

// A patch is named by its content too, so an edited plant is built again.
const patchId = patch ? `-${basename(patch).replace(/\.patch$/, '')}-${createHash('sha256').update(readFileSync(patch)).digest('hex').slice(0, 8)}` : ''
const name = `${app}-${commit.slice(0, 12)}${patchId}`
const work = join(cache, 'builds', name)
const out = join(work, dist)
if (existsSync(join(out, 'index.html'))) {
  console.log(out)
  process.exit(0)
}

try {
  if (existsSync(work)) {
    git('worktree', 'remove', '--force', work)
  }
} catch {
  rmSync(work, { recursive: true, force: true })
  git('worktree', 'prune')
}
mkdirSync(join(cache, 'builds'), { recursive: true })
git('worktree', 'add', '--quiet', '--detach', work, commit)
try {
  if (patch) execFileSync('git', ['-C', work, 'apply', patch], loud)
  execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { ...loud, cwd: work })
  // A planted break can leave an import unused, which the type check refuses; vite alone builds it.
  const build = patch ? ['npx', ['vite', 'build']] : ['npm', ['run', 'build']]
  execFileSync(build[0], build[1], { ...loud, cwd: work, env: { ...process.env, ...env } })
} catch (error) {
  console.error(`The build of ${app} at ${commit.slice(0, 7)} failed: ${error.message.split('\n')[0]}`)
  process.exit(1)
}
if (!existsSync(join(out, 'index.html'))) {
  console.error(`The build of ${app} at ${commit.slice(0, 7)} wrote no ${dist}/index.html`)
  process.exit(1)
}
console.log(out)
