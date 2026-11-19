/**
 * 2. A Leaf document's link draws as the document in Peek.
 *
 * What a person sees today: Smoke Test 1 pastes the standing document's Leaf link into a message in the QA team's
 * "Smoke test" topic in Peek and sends it. In the message the link draws as the document's chip, with its title (a
 * link alone on its line draws as a card). The run deletes the message.
 */
import { dOf } from '../lib/apps.mjs'
import { BOX, deleteMessage } from '../lib/peek.mjs'
import { seeText, until } from '../lib/ui.mjs'

const DOCUMENT = 'Smoke test: a document'

export default {
  id: '2',
  title: 'A Leaf document\'s link draws as the document in Peek',
  steps: [
    {
      name: 'Peek: a message with the document\'s link draws the document by its title',
      async run(t) {
        const room = t.standing.room
        const page = t.at(await t.one.open('peek', `/topic/${dOf(room)}`))
        await seeText(page, 'Smoke test', { timeout: 90_000 })
        const words = `The smoke test's document, ${t.stamp}:`
        const link = `https://leaf.estiva.app/document/smoke-test-a-document-${dOf(t.standing.document)}`
        await page.locator(BOX).click({ timeout: 60_000 })
        await page.keyboard.type(`${words} `)
        await page.evaluate((text) => document.execCommand('insertText', false, text), link)
        t.made(`Smoke Test 1's message "${words}"`, () => deleteMessage(t.one, room, words))
        await page.keyboard.press('Enter')
        await seeText(page, words, { scope: 'main' })
        // The link sits among words, so Peek draws it as the document's chip, named by its title; a link on its own
        // line draws as its card. Either way the title is read from Leaf's document: the URL itself does not carry it.
        await until(page, `the document's title in the message, where its link was`,
          ({ words, title }) => [...document.querySelectorAll('main *')].some((el) => el.childElementCount > 0 && el.innerText?.startsWith(words) && el.innerText.includes(title) && !el.innerText.includes('leaf.estiva.app')),
          { words, title: DOCUMENT }, 60_000)
        await t.one.settled()
      },
    },
  ],
}
