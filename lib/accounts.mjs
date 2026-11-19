/**
 * The smoke test's two accounts, Smoke Test 1 and Smoke Test 2: test accounts of its own (Miky, 2026-11-19), so a
 * run never shares QA-1's request budget with another session. Made on the box with estiva-id's
 * `create-test-account`; their secrets sit beside the QA ones in `~/.estiva-qa.env` as `SMOKE{n}_EMAIL` /
 * `SMOKE{n}_SECRET`.
 *
 * Estiva ID's test login allows about one sign-in every 30 s across every process, so a sign-in is kept in
 * `~/.cache/estiva-smoke/smoke<n>.json` and reused until an app refuses it; then `fresh()` signs in again.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const ID = 'https://id.estiva.app'
const CACHE = join(homedir(), '.cache', 'estiva-smoke')
const ENV = join(homedir(), '.estiva-qa.env')
/** The test login's spacing across processes, with a margin. */
const LOGIN_GAP_MS = 31_000
let lastLogin = 0

export const ACCOUNTS = [1, 2]

function credentials(n) {
  if (!process.env[`SMOKE${n}_EMAIL`] && existsSync(ENV)) process.loadEnvFile(ENV)
  const email = process.env[`SMOKE${n}_EMAIL`]
  const secret = process.env[`SMOKE${n}_SECRET`]
  if (!email || !secret) throw new Error(`SMOKE${n}_EMAIL / SMOKE${n}_SECRET are not set (nor in ${ENV})`)
  return { email, secret }
}

/** A kept sign-in for account `n`, or a new one. */
export async function session(n) {
  const file = join(CACHE, `smoke${n}.json`)
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  return fresh(n)
}

/** A new sign-in for account `n`, kept for the next run. */
export async function fresh(n) {
  const wait = lastLogin + LOGIN_GAP_MS - Date.now()
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  for (let attempt = 0; ; attempt++) {
    lastLogin = Date.now()
    const response = await fetch(new URL('/auth/test-login', ID), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(credentials(n)),
    })
    const body = await response.json().catch(() => ({}))
    if (response.status === 200) {
      mkdirSync(CACHE, { recursive: true, mode: 0o700 })
      writeFileSync(join(CACHE, `smoke${n}.json`), JSON.stringify(body), { mode: 0o600 })
      // The modes above apply only on creation; an older file or folder keeps its own.
      chmodSync(CACHE, 0o700)
      chmodSync(join(CACHE, `smoke${n}.json`), 0o600)
      return body
    }
    // Another process signed in within the last 30 s.
    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, LOGIN_GAP_MS))
      continue
    }
    throw new Error(`test-login for smoke-${n}: ${response.status} ${JSON.stringify(body)}`)
  }
}
