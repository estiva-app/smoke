/**
 * The smoke test: walk the core flows on production as Smoke Test 1 and Smoke Test 2, and say which step failed.
 *
 *   node run.mjs                         every flow
 *   node run.mjs --flow 1,4              some of them
 *   node run.mjs --serve peek=<dist>     that app answered from a local build, only for this run's browser
 *   node run.mjs --json out/result.json  the result as JSON as well
 *   node run.mjs --expect leaf=<commit>  first wait until that app serves the commit or a later one (`/land`, after a
 *                                        deploy; peek, ship, leaf, id; comma-separated for several)
 *
 * Exit 0 when every step passed or failed on a known, still-open bug; 1 on any other failure; 2 when the run could
 * not start. Screenshots of failed steps and the result go to `out/<started>/`.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { account, launch, peekSlotVersion } from './lib/browser.mjs'
import { awaitServed, issueOpen, summary, versions } from './lib/report.mjs'

const args = process.argv.slice(2)
const options = { flow: null, serve: {}, expect: {}, json: null }
for (let i = 0; i < args.length; i += 2) {
  const [name, value] = [args[i], args[i + 1]]
  if (name === '--flow') options.flow = new Set(value.split(','))
  else if (name === '--serve') {
    const [app, dist] = value.split('=')
    options.serve[app] = dist
  } else if (name === '--expect') {
    for (const pair of value.split(',')) {
      const [app, commit] = pair.split('=')
      options.expect[app] = commit
    }
  } else if (name === '--json') options.json = value
  else {
    console.error(`unknown option ${name}`)
    process.exit(2)
  }
}

const here = new URL('.', import.meta.url).pathname
const standing = JSON.parse(readFileSync(join(here, 'standing.json'), 'utf8'))
const flows = []
for (const file of readdirSync(join(here, 'flows')).filter((f) => /^\d.*\.mjs$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b)))
  flows.push((await import(join(here, 'flows', file))).default)
const chosen = flows.filter((flow) => !options.flow || options.flow.has(flow.id))

const started = new Date()
const stamp = started.toISOString().replace(/[:.]/g, '-')
const outDir = join(here, 'out', stamp)
mkdirSync(outDir, { recursive: true })

/** `--expect`: the run starts only once each named app serves the deploy under test; otherwise it tested nothing new. */
const expected = Object.keys(options.expect).length ? await awaitServed(options.expect) : []
if (expected.some((e) => !e.ok)) {
  const result = { startedAt: started.toISOString(), versions: await versions(), served: [], expected, flows: [], requests: [], busy: [], leftovers: [], seconds: 0, ok: false, error: 'the deploy under test is not served' }
  const text = `${summary(result)}\nThe run did not start: the deploy under test is not served.`
  writeFileSync(join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
  writeFileSync(join(outDir, 'result.txt'), `${text}\n`)
  if (options.json) writeFileSync(options.json, `${JSON.stringify(result, null, 2)}\n`)
  console.log(text)
  process.exit(2)
}

/** The walk's own time, without the wait for the deploy. */
const walkFrom = Date.now()
const result = {
  startedAt: started.toISOString(),
  expected,
  versions: await versions().catch((error) => {
    console.error(`The run could not start: no app versions (${error.message})`)
    process.exit(2)
  }),
  served: Object.keys(options.serve),
  flows: [],
  requests: [],
  busy: [],
  leftovers: [],
}

const browser = await launch()
const made = []
/** Browsers a flow opened besides the two accounts' own (`t.fresh`): their requests and busy answers count too. */
const extra = []
try {
  const peekSlot = await peekSlotVersion(result.versions.peek)
  const one = await account(browser, 1, { serve: options.serve, peekSlot })
  const two = await account(browser, 2, { serve: options.serve, peekSlot })
  const t = {
    one,
    two,
    standing,
    stamp: started.toISOString().slice(0, 16).replace('T', ' '),
    /** One word only this run's titles hold, so search can find them: search matches the starts of words. */
    word: `r${started.getTime().toString(36).slice(-6)}`,
    /** What later flows share: the run's own issue, made once. */
    state: {},
    /** The page a step is looking at, for its screenshot when it fails. */
    page: null,
    at(page) {
      t.page = page
      return page
    },
    /** Something the run made, and how to remove it; removed in reverse at the end, whatever happened. */
    made(what, remove) {
      made.push({ what, remove })
    },
    /** A new browser for account `n` that holds only Estiva ID's sign-in cookie, as a person arriving fresh. Close it. */
    async fresh(n) {
      const me = await account(browser, n, { serve: options.serve, peekSlot })
      extra.push(me)
      return me
    },
  }

  for (const flow of chosen) {
    const record = { id: flow.id, title: flow.title, steps: [] }
    result.flows.push(record)
    let stopped = null
    for (const step of flow.steps) {
      const began = Date.now()
      const entry = { name: step.name, status: 'passed', ms: 0 }
      record.steps.push(entry)
      if (stopped) {
        entry.status = 'skipped'
        entry.error = `after "${stopped}" failed`
        continue
      }
      t.page = null
      try {
        await step.run(t)
        if (step.known) {
          const open = issueOpen(step.known.addr)
          if (open) entry.note = `passed although "${step.known.title}" is open: is it fixed?`
        }
      } catch (error) {
        entry.error = String(error.message ?? error).split('\n')[0].slice(0, 400)
        if (t.page) {
          entry.screenshot = join(outDir, `${flow.id}-${record.steps.length}.png`)
          await t.page.screenshot({ path: entry.screenshot }).catch(() => (entry.screenshot = undefined))
        }
        // Known only while its issue is read as open; unreadable (no `ship` CLI) fails, so a fixed bug's return is never hidden.
        const open = step.known ? issueOpen(step.known.addr) : false
        if (step.known && open === true) {
          entry.status = 'known'
          entry.known = { title: step.known.title, link: `https://ship.estiva.app/issue/${step.known.addr.split(':')[2]}` }
        } else {
          entry.status = 'failed'
          if (step.known) entry.error += open === null ? ` — could not read whether "${step.known.title}" is still open` : ` — "${step.known.title}" is closed, so this is no longer known`
          if (!step.continues) stopped = step.name
        }
      }
      entry.ms = Date.now() - began
    }
  }

  for (const { what, remove } of made.reverse()) {
    try {
      await remove()
    } catch (error) {
      result.leftovers.push(`${what}: ${String(error.message ?? error).split('\n')[0]}`)
    }
  }
  for (const me of [one, two, ...extra]) {
    await me.settled().catch((error) => result.leftovers.push(`Smoke Test ${me.n}: ${error.message}`))
    result.requests.push({ n: me.n, http: me.stats.http, frames: me.stats.frames, pacedSeconds: Math.round((me.stats.pacedMs ?? 0) / 1000), ...(extra.includes(me) ? { fresh: true } : {}) })
    result.busy.push(...me.stats.busy.map((busy) => ({ n: me.n, ...busy })))
    result.stuck = [...(result.stuck ?? []), ...me.stats.stuck.map((what) => `Smoke Test ${me.n} ${what}`)]
  }
} catch (error) {
  console.error(`The run could not go on: ${error.stack ?? error}`)
  result.error = String(error.message ?? error)
} finally {
  await browser.close()
}

result.seconds = Math.round((Date.now() - walkFrom) / 1000)
result.versionsAfter = await versions()
result.versionsChanged = JSON.stringify(result.versionsAfter) !== JSON.stringify(result.versions)
const steps = result.flows.flatMap((flow) => flow.steps)
result.ok = !result.error && steps.every((step) => step.status !== 'failed') && result.busy.length === 0 && result.leftovers.length === 0
const text = summary(result)
writeFileSync(join(outDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
writeFileSync(join(outDir, 'result.txt'), `${text}\n`)
if (options.json) writeFileSync(options.json, `${JSON.stringify(result, null, 2)}\n`)
console.log(text)
process.exit(result.error ? 2 : result.ok ? 0 : 1)
