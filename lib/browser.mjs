/**
 * One headless Chromium, one browser context per account, a tab per app: Peek's `scripts/probe.mjs` (PER-23) cut
 * down to what the smoke test needs and kept signed in across steps, so a run signs each account in once.
 *
 * Signing in is the real one: the Estiva ID session is set as a cookie and each app is loaded signed out, so its
 * silent boot (`/authorize?prompt=none`) turns that into the app's token exactly as it does for a person.
 *
 * `serve: { peek: '<dist>' }` answers that app's origin from a local build, so a build nobody else is served runs
 * at the real origin, against the real relay and Estiva ID: how a bug is put back on purpose to prove the run
 * catches it (`--serve peek=<dist>`).
 *
 * Every request and socket frame an account's tabs send to the relay is counted, and a "busy" answer recorded:
 * an HTTP 429 or 503 from the relay, or a socket frame that says `rate-limited`.
 */
import { createHash } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { ID, fresh, session } from './accounts.mjs'

export const APPS = {
  peek: 'https://peek.estiva.app',
  ship: 'https://ship.estiva.app',
  leaf: 'https://leaf.estiva.app',
}
export const RELAY = 'estiva.estiva.app'
const SIGN_IN_MS = 60_000
/** A write older than this that has reported no end is taken as abandoned (a `/sign` answers in well under 5 s). */
const STUCK_MS = 45_000
/** At most this many relay requests in the last minute before a page opens: 300 less the dearest open (~100) and a margin. */
const PACE = 170
/** Each account's relay requests in the last minute, by account number. */
const RECENT = {}
/** The relay's socket window, and how many messages may be in it before a page opens. */
const WS_WINDOW_MS = 5_000
const WS_PACE = 5
/** Each account's socket messages in the last window, by account number. */
const SENT = {}

/** The Chromium build `playwright-core` 1.61.1 matches; `npx playwright-core install chromium` puts it there. */
const executablePath = join(homedir(), '.cache/ms-playwright/chromium-1228/chrome-linux64/chrome')

export async function launch() {
  if (!existsSync(executablePath)) throw new Error(`no Chromium at ${executablePath}: run npx playwright-core install chromium`)
  return chromium.launch({ executablePath })
}

/**
 * Account `n`'s browser context. `peekSlot` is Peek's read-state slot version pair from the deployed source
 * ({@link peekSlotVersion}); without it every run would leave a new read-state slot on the relay.
 */
export async function account(browser, n, { serve = {}, peekSlot = null } = {}) {
  let signIn = await session(n)
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ...(Object.keys(serve).length ? { serviceWorkers: 'block' } : {}),
  })
  const idOrigin = new URL(ID)
  const setCookie = (s) =>
    context.addCookies([
      { name: s.cookie_name, value: s.session_token, domain: idOrigin.hostname, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
    ])
  await setCookie(signIn)
  await context.addInitScript(pinReadStateSlots, pinnedSlots(signIn.pubkey, peekSlot))
  for (const [app, dist] of Object.entries(serve)) await serveBuild(context, APPS[app], dist, idOrigin)

  // `published`: every event this account sent to the relay (HTTP or socket), its kind and text, in order — how a removal proves
  // it went out.
  const stats = { http: 0, frames: 0, busy: [], published: [], stuck: [] }
  // Writes on their way to the relay: an app shows a change before it is published, so a step that ends (or a
  // browser that closes) at the screen can drop the write itself. `settled()` waits for these.
  // Each write and when it started. A few never report an end (19 Nov: one held every later wait of a run for 60 s);
  // past `STUCK_MS` one is no longer waited for, and is named in `stats.stuck`.
  const writing = new Map()
  let lastWrite = 0
  // Estiva ID's `/sign` comes first, so a write counts from its signing.
  const isWrite = (r) => {
    if (r.method() !== 'POST') return false
    const url = new URL(r.url())
    return (url.hostname === RELAY && url.pathname === '/events') || (url.origin === ID && url.pathname === '/sign')
  }
  const done = (r) => {
    if (writing.delete(r)) lastWrite = Date.now()
  }
  // The relay allows 300 requests a minute for each account; a page open costs 55–100. Before an open, wait until the
  // last minute's requests leave room for one (`PACE`), so a run never reaches the limit.
  // One list per account, shared by every browser it has open: the relay counts the account, not the browser.
  const recent = (RECENT[n] ??= [])
  context.on('request', (r) => {
    if (new URL(r.url()).hostname === RELAY) {
      stats.http++
      recent.push(Date.now())
    }
    if (isWrite(r)) writing.set(r, Date.now())
    if (isWrite(r) && new URL(r.url()).hostname === RELAY) {
      const raw = r.postData() ?? ''
      try {
        stats.published.push({ kind: JSON.parse(raw).kind, raw: raw.slice(0, 4000) })
      } catch {
        stats.published.push({ kind: undefined, raw: raw.slice(0, 4000) })
      }
    }
  })
  // The relay also allows each account 50 socket messages (REQ, EVENT, COUNT) in any 5 s. One page open stays under
  // it, two in a row did not (19 Nov: Peek's room, then its Teams list): before an open, the last open's burst must
  // have left the window.
  const sent = (SENT[n] ??= [])
  // `socketOnly`: a click that opens a file inside a page bursts like an open (19 Nov: Peek's search, then its answer).
  const paced = async ({ socketOnly = false } = {}) => {
    // A page held open keeps talking; its trickle is not a burst, so the socket wait gives up after two windows.
    const socketUntil = Date.now() + 2 * WS_WINDOW_MS
    for (;;) {
      while (recent.length && recent[0] < Date.now() - 60_000) recent.shift()
      while (sent.length && sent[0] < Date.now() - WS_WINDOW_MS) sent.shift()
      if ((socketOnly || recent.length <= PACE) && (sent.length <= WS_PACE || Date.now() > socketUntil)) return
      stats.pacedMs = (stats.pacedMs ?? 0) + 1000
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  context.on('requestfinished', done)
  context.on('requestfailed', done)
  context.on('response', (r) => {
    if (new URL(r.url()).hostname === RELAY && (r.status() === 429 || r.status() === 503))
      stats.busy.push({ at: new Date().toISOString(), what: `${r.status()} ${new URL(r.url()).pathname}` })
  })
  const watchSockets = (page) =>
    page.on('websocket', (ws) => {
      if (new URL(ws.url()).hostname !== RELAY) return
      ws.on('framesent', ({ payload }) => {
        stats.frames++
        const text = String(payload)
        if (/^\["(REQ|EVENT|COUNT)"/.test(text)) sent.push(Date.now())
        if (!text.startsWith('["EVENT"')) return
        try {
          stats.published.push({ kind: JSON.parse(text)[1]?.kind, raw: text.slice(0, 4000) })
        } catch {
          stats.published.push({ kind: undefined, raw: text.slice(0, 4000) })
        }
      })
      ws.on('framereceived', ({ payload }) => {
        const text = String(payload)
        // Only the relay's own answers (OK / CLOSED / NOTICE), never an event that quotes the words.
        if (/^\["(OK|CLOSED|NOTICE)"/.test(text) && /rate-limited|busy/i.test(text)) stats.busy.push({ at: new Date().toISOString(), what: text.slice(0, 200) })
      })
    })
  context.on('page', watchSockets)

  const tabs = new Map()
  return {
    n,
    pubkey: signIn.pubkey,
    stats,
    context,
    /**
     * The account's one tab for `app`, at `path`, signed in. One tab per app, so a page left behind does not keep
     * reading the relay; a flow that holds a page open while another account writes keeps it by not reopening it.
     */
    async open(app, path = '/') {
      let page = tabs.get(app)
      const url = APPS[app] + path
      if (!page) {
        page = await context.newPage()
        tabs.set(app, page)
      }
      await paced()
      await page.goto(url)
      if (!(await signedIn(page, app))) {
        // The kept sign-in ended: sign in again, once.
        signIn = await fresh(n)
        await setCookie(signIn)
        await page.goto(url)
        if (!(await signedIn(page, app))) throw new Error(`${app} did not sign Smoke Test ${n} in within ${SIGN_IN_MS / 1000} s`)
      }
      // An app can drop the path on its way back from sign-in (Leaf did): go there again, signed in now.
      if (new URL(page.url()).pathname !== new URL(url).pathname) await page.goto(url)
      return page
    },
    /** Before a click that opens something inside a page: wait until the last burst has left the relay's 5 s window. */
    calm() {
      return paced({ socketOnly: true })
    },
    /** Wait until no write is on its way to the relay and none started for `quietMs`. */
    async settled({ quietMs = 2000, timeout = 60_000 } = {}) {
      const end = Date.now() + timeout
      const live = () => {
        for (const [r, at] of writing) {
          if (Date.now() - at < STUCK_MS) continue
          writing.delete(r)
          stats.stuck.push(`${new Date(at).toISOString()} ${new URL(r.url()).host}${new URL(r.url()).pathname}`)
        }
        return writing.size
      }
      while (live() > 0 || Date.now() - lastWrite < quietMs) {
        if (Date.now() > end) throw new Error(`${writing.size} write(s) still on their way to the relay after ${timeout / 1000} s`)
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
    },
    async close() {
      await this.settled().catch(() => {})
      await context.close()
    },
  }
}

async function signedIn(page, app) {
  try {
    await page.waitForFunction(
      (origin) =>
        location.origin === origin &&
        location.pathname !== '/auth/callback' &&
        [sessionStorage, localStorage].some((store) =>
          Object.keys(store).some((key) => /^[a-z0-9-]+\.estiva-?id\b/i.test(key) && /token/i.test(key)),
        ),
      APPS[app],
      { timeout: SIGN_IN_MS, polling: 250 },
    )
    return true
  } catch {
    return false
  }
}

/** Answer `origin` from a local build `dist`, and turn Estiva ID's redirect back to it into a navigation we route. */
async function serveBuild(context, origin, dist, idOrigin) {
  if (!existsSync(join(dist, 'index.html'))) throw new Error(`--serve: no index.html in ${dist}`)
  // A predicate, not a glob: `${origin}/**` misses `/?code=…`, and the page then silently comes from production.
  await context.route(
    (url) => url.origin === origin,
    (route) => {
      const path = join(dist, decodeURIComponent(new URL(route.request().url()).pathname))
      return route.fulfill({ path: existsSync(path) && statSync(path).isFile() ? path : join(dist, 'index.html') })
    },
  )
  await context.route(
    (url) => url.origin === idOrigin.origin,
    async (route) => {
      if (!route.request().isNavigationRequest()) return route.continue()
      let response
      try {
        response = await route.fetch({ maxRedirects: 0 })
      } catch {
        return route.abort('connectionreset')
      }
      const location = response.headers()['location']
      if (response.status() >= 300 && response.status() < 400 && location && new URL(location, idOrigin).origin === origin) {
        const to = JSON.stringify(new URL(location, idOrigin).href)
        return route.fulfill({ status: 200, contentType: 'text/html', body: `<script>location.replace(${to})</script>` })
      }
      return route.fulfill({ response })
    },
  )
}

/**
 * Peek's read-state slot version, read from the source Peek is serving (its `version.json` commit): a slot planted
 * without it is moved to a new random id on load, and every run would mint one.
 */
export async function peekSlotVersion(commit) {
  const response = await fetch(`https://raw.githubusercontent.com/estiva-app/peek/${commit}/src/nostr/readState.ts`)
  if (!response.ok) return null
  const source = await response.text()
  const key = /export const SLOT_VERSION_STORAGE_KEY = '([^']+)'/.exec(source)?.[1]
  const value = /export const SLOT_VERSION = '([^']+)'/.exec(source)?.[1]
  return key && value ? { key, value } : null
}

/** One read-state slot per account and app, the same every run. */
function pinnedSlots(pubkey, peekSlot) {
  const hex = (label) => createHash('sha256').update(`smoke-read-state:${label}:${pubkey}`).digest('hex')
  return {
    [APPS.peek]: {
      'estiva-peek:read-state-slot': JSON.stringify({ slotId: hex('peek').slice(0, 32), clientId: `peek-${hex('peek-client').slice(0, 8)}` }),
      ...(peekSlot ? { [peekSlot.key]: peekSlot.value } : {}),
    },
    [APPS.ship]: {
      'ship.readstate.slot': JSON.stringify({ slotId: hex('ship').slice(0, 32), clientId: `ship-${hex('ship-client').slice(0, 8)}` }),
    },
  }
}

/** Runs in the page before the app: plant this origin's slot unless the app already holds one. */
function pinReadStateSlots(byOrigin) {
  const plant = byOrigin[location.origin]
  if (!plant) return
  const [first] = Object.keys(plant)
  if (localStorage.getItem(first)) return
  for (const [key, value] of Object.entries(plant)) localStorage.setItem(key, value)
}
