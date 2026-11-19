/**
 * 7. Peek: send a message in a topic; the other person sees it as unread.
 *
 * What a person sees today: both accounts are in the QA team, whose room is "Smoke test". Smoke Test 1 has Peek open
 * on Teams, where the room's row has a quiet ring. Smoke Test 2 sends a message in the room. Without a reload, the
 * row's dot turns blue for Smoke Test 1; they open the room, the message is there, and the dot is quiet again. The run
 * deletes the message.
 */
import { dOf } from '../lib/apps.mjs'
import { BOX, deleteMessage } from '../lib/peek.mjs'
import { seeText, until } from '../lib/ui.mjs'

/** How long a new message may take to light the row. */
const LIVE_MS = 30_000
/**
 * Open in Peek since 19 Nov, and only sometimes: a full run failed at the last step once, then passed alone. Until it
 * is closed, that step reports it as known, so `/land` does not revert a deploy over it.
 */
const UNREAD_ROOM_BUG = {
  addr: '30851:b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46:6ede0068-4f72-45b2-9fd3-7dc8d8e44517',
  title: 'Opening an unread room sometimes does not show the new message',
}

/** Whether the room's row in Peek's sidebar is lit: true, false, or null while the row is not drawn. */
const rowLit = (d) => {
  // The sidebar's row: its link sits beside the row's own menu (`data-nav-menu`), unlike a link to it in the page.
  const row = [...document.querySelectorAll(`a[href*="${d}"]`)].find((a) => a.parentElement.querySelector(':scope > [data-nav-menu]'))
  if (!row) return null
  return Boolean(row.parentElement.querySelector('[data-unread]'))
}

export default {
  id: '7',
  title: 'Peek: a message in a topic shows as unread to the other person',
  steps: [
    {
      name: 'Peek: Smoke Test 1 has read the room, and its row is quiet',
      async run(t) {
        const d = dOf(t.standing.room)
        const room = t.at(await t.one.open('peek', `/topic/${d}`))
        await seeText(room, 'Smoke test', { timeout: 90_000, scope: 'main' })
        // The Teams list, where the room is a row; held open while Smoke Test 2 writes.
        const page = t.at(await t.one.open('peek', '/app/teams'))
        await until(page, 'the room\'s row, quiet', `(${rowLit})(${JSON.stringify(d)}) === false`, undefined, 60_000)
        t.state.teams = page
      },
    },
    {
      name: 'Peek: Smoke Test 2 sends a message in the room',
      async run(t) {
        const room = t.standing.room
        const page = t.at(await t.two.open('peek', `/topic/${dOf(room)}`))
        await seeText(page, 'Smoke test', { timeout: 90_000, scope: 'main' })
        const words = `A message from Smoke Test 2, ${t.stamp}.`
        await page.locator(BOX).click({ timeout: 60_000 })
        await page.keyboard.type(words)
        t.made(`Smoke Test 2's message "${words}"`, () => deleteMessage(t.two, room, words))
        await page.keyboard.press('Enter')
        await seeText(page, words, { scope: 'main' })
        await t.two.settled()
        t.state.message = words
      },
    },
    {
      name: 'Peek: the room turns unread for Smoke Test 1 without reloading',
      async run(t) {
        const page = t.at(t.state.teams)
        const d = dOf(t.standing.room)
        await until(page, 'the room\'s row to be lit', `(${rowLit})(${JSON.stringify(d)}) === true`, undefined, LIVE_MS)
      },
    },
    {
      name: 'Peek: Smoke Test 1 opens the room, reads the message, and the row is quiet again',
      known: UNREAD_ROOM_BUG,
      async run(t) {
        const d = dOf(t.standing.room)
        const page = t.at(await t.one.open('peek', `/topic/${d}`))
        await seeText(page, t.state.message, { timeout: 60_000, scope: 'main' })
        await until(page, 'the room\'s row to be quiet', `(${rowLit})(${JSON.stringify(d)}) === false`, undefined, 30_000)
      },
    },
  ],
}
