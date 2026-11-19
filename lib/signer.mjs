/**
 * Read and write the relay as a smoke account, outside the apps — only for removing what a stopped run left where no
 * app can reach it any more (a comment on an issue that is already deleted). It borrows the session the apps sign
 * with: Estiva ID's `/sign` signs as the session's account, and the relay is asked with a NIP-98 header signed the
 * same way. The session token stays in this process and is never printed.
 */
import { createHash, randomBytes } from 'node:crypto'
import { ID } from './accounts.mjs'
import { RELAY } from './browser.mjs'

const sha256 = (text) => createHash('sha256').update(text).digest('hex')
const now = () => Math.floor(Date.now() / 1000)

export async function signerOf(me) {
  let bearer
  const got = new Promise((resolve) => {
    me.context.on('request', (r) => {
      const auth = r.headers().authorization
      if (!bearer && auth?.startsWith('Bearer ') && r.url().startsWith(`${ID}/sign`)) {
        bearer = auth
        resolve()
      }
    })
  })
  await me.open('ship', '/')
  let timer
  await Promise.race([got, new Promise((_, reject) => (timer = setTimeout(() => reject(new Error('Ship signed nothing within 60 s')), 60_000)))])
  clearTimeout(timer)

  async function sign(event) {
    const response = await fetch(`${ID}/sign`, {
      method: 'POST',
      headers: { authorization: bearer, 'content-type': 'application/json' },
      body: JSON.stringify({ event: { created_at: now(), content: '', ...event } }),
    })
    if (!response.ok) throw new Error(`/sign answered ${response.status}: ${(await response.text()).slice(0, 200)}`)
    const body = await response.json()
    return body.event ?? body
  }

  async function relay(path, payload) {
    const url = `https://${RELAY}${path}`
    const text = JSON.stringify(payload)
    const auth = await sign({ kind: 27235, tags: [['u', url], ['method', 'POST'], ['nonce', randomBytes(16).toString('hex')], ['payload', sha256(text)]] })
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Nostr ${Buffer.from(JSON.stringify(auth)).toString('base64')}`, 'content-type': 'application/json' },
      body: text,
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new Error(`${path} answered ${response.status}: ${JSON.stringify(body).slice(0, 200)}`)
    return body
  }

  return {
    /** Events matching the filters (a list), as the relay answers `/query`. */
    async query(filters) {
      const body = await relay('/query', filters)
      return Array.isArray(body) ? body : (body?.events ?? [])
    },
    /** Delete one of this account's own events (kind:5 naming it by `e`, as Ship deletes a comment). */
    async remove(event) {
      const deletion = await sign({ kind: 5, tags: [['e', event.id], ['k', String(event.kind)]] })
      return relay('/events', deletion)
    },
  }
}
