/** Opening a file the way each app shows it, by the path every app's host shares (`/<word>/<d>`). */
import { click, seeText } from './ui.mjs'

export const dOf = (addr) => addr.split(':')[2]

/** Open the file at `/<word>/<d>` in `app` as `me` and wait for its title. */
export async function openFile(t, me, app, word, addr, title, { timeout = 90_000 } = {}) {
  const page = t.at(await me.open(app, `/${word}/${dOf(addr)}`))
  await seeText(page, title, { timeout, scope: 'main' })
  return page
}

/** Peek's side panel, opened if it is closed. */
export async function peekPanel(page) {
  const show = page.getByRole('button', { name: 'Show side panel' })
  if (await show.count()) await click(page, 'Show side panel')
  await seeText(page, 'Overview', { timeout: 30_000 })
}
