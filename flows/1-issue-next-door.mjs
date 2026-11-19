/**
 * 1. An issue made in Ship opens in Peek and in Leaf.
 *
 * What a person sees today:
 * - Peek: the issue's page has its title in the side panel's Overview card and its conversation in the middle. Peek
 *   draws another app's file as a card with its title and summary, not its text (Katerina's review, 30 Oct,
 *   peek#583), so the issue's text and picture are not drawn in Peek.
 * - Leaf: the issue opens as a page: its title, its text, the picture as a card with its thumbnail, and its
 *   conversation beside it.
 * - An issue with no text opens in Leaf's editor, empty, and what is typed there is the issue's text in Ship
 *   (leaf#137). Leaf hides the conversation of an issue with no description (an open bug).
 */
import { openFile, peekPanel } from '../lib/apps.mjs'
import { runIssue } from '../lib/runIssue.mjs'
import { seeText, until } from '../lib/ui.mjs'

const ISSUE = 'Smoke test: an issue with a picture'
const TEXT = 'A standing issue the smoke test opens in Peek, Ship and Leaf after every deploy.'
const COMMENT = 'A standing comment the smoke test reads in every app.'
const PICTURE = 'smoke-picture.png'
const NO_DESCRIPTION_BUG = {
  addr: '30851:b38fd2687b17bbde2e8079577cba601936acfe1b731d2d2ba7cdef29a063db46:6b4bf85f-0b43-41bd-b691-257a412389e5',
  title: 'Leaf hides the conversation of an issue with no description',
}

/** A picture drawn as its card: the file name, with a loaded thumbnail beside it — not the name alone. */
function pictureDrawn(page, name) {
  return until(page, `the picture ${name} drawn with its thumbnail`, (name) => {
    for (const label of [...document.querySelectorAll('main *')].filter((el) => el.childElementCount === 0 && el.textContent.trim() === name)) {
      let card = label
      for (let up = 0; up < 5 && card; up++, card = card.parentElement)
        if ([...card.querySelectorAll('img')].some((img) => img.complete && img.naturalWidth > 0)) return true
    }
    return false
  }, name, 60_000)
}

export default {
  id: '1',
  title: 'An issue made in Ship opens in Peek and in Leaf',
  steps: [
    {
      name: 'Peek: the issue opens with its title and its conversation',
      continues: true,
      async run(t) {
        const page = await openFile(t, t.one, 'peek', 'issue', t.standing.issue, COMMENT)
        await peekPanel(page)
        await seeText(page, ISSUE)
      },
    },
    {
      name: 'Leaf: the issue opens with its title, text, picture and conversation',
      continues: true,
      async run(t) {
        const page = await openFile(t, t.two, 'leaf', 'issue', t.standing.issue, ISSUE)
        await seeText(page, TEXT, { scope: 'main' })
        await pictureDrawn(page, PICTURE)
        await seeText(page, COMMENT)
      },
    },
    {
      name: 'Ship: add an issue with only a title',
      async run(t) {
        await runIssue(t)
      },
    },
    {
      name: 'Leaf: the issue with no text opens in the editor',
      async run(t) {
        const issue = await runIssue(t)
        const page = await openFile(t, t.one, 'leaf', 'issue', issue.addr, issue.title)
        await page.locator('main [contenteditable=true][aria-label="Document"]').waitFor({ timeout: 60_000 })
      },
    },
    {
      name: 'Leaf: the issue with no text shows its conversation',
      known: NO_DESCRIPTION_BUG,
      continues: true,
      async run(t) {
        const page = t.at(await t.one.open('leaf', `/issue/${t.state.issue.d}`))
        await page.locator('[contenteditable][aria-label^="Comment on"]').waitFor({ timeout: 30_000 })
      },
    },
    {
      name: 'Leaf: words typed there are the issue\'s text in Ship',
      async run(t) {
        const issue = t.state.issue
        const page = t.at(await t.one.open('leaf', `/issue/${issue.d}`))
        const words = `Written in Leaf by the smoke test, ${t.stamp}.`
        await page.locator('main [contenteditable=true][aria-label="Document"]').click({ timeout: 60_000 })
        await page.keyboard.type(words)
        // Leaf saves as you type; leave the editor so nothing waits on a blur.
        await page.locator('h1').first().click()
        await t.one.settled()
        issue.text = words
        const ship = await openFile(t, t.two, 'ship', 'issue', issue.addr, issue.title)
        await seeText(ship, words, { scope: 'main', timeout: 60_000 })
      },
    },
  ],
}
