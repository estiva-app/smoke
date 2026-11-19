/**
 * 9. Leaf: make a document, write in it, comment on a block.
 *
 * What a person sees today: Smoke Test 2 presses New document on Leaf's Home, names it and picks the QA team, and Leaf
 * opens it. They type a line in it, select the line's words and press Comment, and write a comment, which shows in the
 * Comments column. Opened again, the line and the comment are there. The run deletes the document.
 */
import { deleteDocument, makeDocument } from '../lib/leaf.mjs'
import { click, seeText, until } from '../lib/ui.mjs'

const TEAM = 'QA'
const BODY = 'main [contenteditable][aria-label="Document"]'

export default {
  id: '9',
  title: 'Leaf: a document made, written in and commented on a block',
  steps: [
    {
      name: 'Leaf: Smoke Test 2 makes a document in the QA team',
      async run(t) {
        const title = `Smoke run ${t.word}, ${t.stamp}: a document`
        const made = await makeDocument(t, t.two, TEAM, title)
        t.state.document = { d: made.d, title }
        t.made(`the run's document "${title}"`, () => deleteDocument(t.two, t.state.document))
      },
    },
    {
      name: 'Leaf: Smoke Test 2 writes a line in it',
      async run(t) {
        const page = t.at(await t.two.open('leaf', `/document/${t.state.document.d}`))
        t.state.line = `Written by the smoke test in Leaf, ${t.stamp}.`
        await page.locator(BODY).click({ timeout: 60_000 })
        await page.keyboard.type(t.state.line)
        await seeText(page, t.state.line, { scope: BODY })
        // Leaf saves the text when you leave it: click the title, as a person moves on.
        await page.locator('main h1').first().click()
        await t.two.settled()
      },
    },
    {
      name: 'Leaf: Smoke Test 2 comments on the line',
      async run(t) {
        const page = t.at(await t.two.open('leaf', `/document/${t.state.document.d}`))
        await seeText(page, t.state.line, { timeout: 60_000, scope: BODY })
        // Select the line's words, as a person drags across them, then press Comment.
        await page.locator(BODY).getByText(t.state.line).first().click({ clickCount: 3 })
        await until(page, 'the line to be selected', (line) => window.getSelection().toString().includes(line), t.state.line, 10_000)
        await click(page, 'Comment', { exact: true, timeout: 10_000 })
        // Comment moves the typing to a comment box; typed into the page, the words would become the page's (19 Nov).
        await until(page, 'a comment box to take the typing', (body) => {
          const at = document.activeElement
          return at?.isContentEditable && !at.closest(body)
        }, BODY, 10_000)
        t.state.blockComment = `A comment on the line, ${t.stamp}.`
        await page.keyboard.type(t.state.blockComment)
        await page.keyboard.press('Enter')
        await until(page, 'the comment beside the page', ({ words, body }) =>
          document.body.innerText.includes(words) && !document.querySelector(body)?.innerText.includes(words),
        { words: t.state.blockComment, body: BODY }, 30_000)
        await t.two.settled()
      },
    },
    {
      name: 'Leaf: opened again, the line and its comment are there',
      async run(t) {
        const page = t.at(await t.two.open('leaf', `/document/${t.state.document.d}`))
        await seeText(page, t.state.line, { timeout: 60_000, scope: BODY })
        await until(page, 'the comment, beside the page', ({ words, body }) =>
          document.body.innerText.includes(words) && !document.querySelector(body)?.innerText.includes(words),
        { words: t.state.blockComment, body: BODY }, 60_000)
        // On the line, not on the whole document: its card says what it is on ("On the paragraph", or the words quoted).
        await until(page, 'the comment\'s card to say it is on the line, not "On the whole document"',
          (line) => {
            const text = document.body.innerText
            return !text.includes('On the whole document') && (/On the paragraph/.test(text) || text.split(line).length - 1 >= 2)
          }, t.state.line, 30_000)
      },
    },
  ],
}
