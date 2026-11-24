/**
 * 10. Search finds the issue and the document by title.
 *
 * What a person sees today: every app has a search box ("Search Peek...", "Search Leaf...", "Search Ship...", Ctrl+K;
 * Leaf's since KIN-5, Ship's since KIN-6). Smoke Test 2 types the start of the run's issue's title, and the issue is among the
 * answers; choosing it opens it. The same for the run's document (flow 9's; alone, this flow searches the standing
 * one). Search matches the starts of words, so the run's titles carry a word of their own.
 *
 * The box is a search up to two words and a prompt from the third (Peek's "a third word turns the search into a
 * prompt"), so the search steps type two words. A whole title typed as a sentence still lists the file it names,
 * under the prompt; the last step holds that.
 */
import { runIssue } from '../lib/runIssue.mjs'
import { click, seeText } from '../lib/ui.mjs'

const STANDING_DOCUMENT = 'Smoke test: a document'

/** Search `app` (Peek unless said) for `query` as `me` and return the page and the answer titled `title`. */
async function find(t, me, query, title, app) {
  const name = app[0].toUpperCase() + app.slice(1)
  const page = t.at(await me.open(app, '/'))
  await click(page, `Search ${name}`, { timeout: 60_000 })
  const box = page.getByRole('combobox', { name: new RegExp(`^Search ${name}`) })
  await box.fill(query)
  const answer = page.getByRole('option').filter({ hasText: title }).first()
  await answer.waitFor({ timeout: 30_000 }).catch(async () => {
    const offered = await page.getByRole('option').allInnerTexts().catch(() => [])
    throw new Error(`no "${title}" among the answers for "${query}"; it offered: ${offered.map((o) => o.split('\n')[0]).slice(0, 6).join(' / ') || 'nothing'}`)
  })
  return { page, answer }
}

/** Search `app` (Peek unless said) for `query` as `me`, choose the answer titled `title`, and wait for it to open. */
async function findAndOpen(t, me, query, title, app = 'peek') {
  const { page, answer } = await find(t, me, query, title, app)
  // Opening the answer bursts as a page open does, right after the page's own: let the first leave the window.
  await me.calm()
  await answer.click()
  await seeText(page, title, { timeout: 60_000, scope: 'main' })
}

export default {
  id: '10',
  title: 'Search finds the issue and the document by title',
  steps: [
    {
      name: 'Peek: search finds the issue by the start of its title, and opens it',
      continues: true,
      async run(t) {
        const issue = await runIssue(t)
        await findAndOpen(t, t.two, `Smoke ${t.word}`, issue.title)
      },
    },
    {
      name: 'Peek: search finds the document by the start of its title, and opens it',
      continues: true,
      async run(t) {
        const doc = t.state.document
        await findAndOpen(t, t.two, doc ? `Smoke ${t.word}` : 'Smoke doc', doc?.title ?? STANDING_DOCUMENT)
      },
    },
    {
      // Leaf's own search since KIN-5: the same box, in Leaf's top bar; a document opens in Leaf.
      name: 'Leaf: search finds the document by the start of its title, and opens it',
      continues: true,
      async run(t) {
        const doc = t.state.document
        await findAndOpen(t, t.two, doc ? `Smoke ${t.word}` : 'Smoke doc', doc?.title ?? STANDING_DOCUMENT, 'leaf')
      },
    },
    {
      // Ship's own search since KIN-6: the same box, in Ship's top bar; an issue opens in Ship.
      name: 'Ship: search finds the issue by the start of its title, and opens it',
      continues: true,
      async run(t) {
        const issue = await runIssue(t)
        await findAndOpen(t, t.two, `Smoke ${t.word}`, issue.title, 'ship')
      },
    },
    {
      // A document is listed in Ship too, saying where it opens: a Leaf page opens in Leaf, not in Ship.
      name: 'Ship: search lists the document, saying it opens in Leaf',
      continues: true,
      async run(t) {
        const doc = t.state.document
        const title = doc?.title ?? STANDING_DOCUMENT
        const { answer } = await find(t, t.two, doc ? `Smoke ${t.word}` : 'Smoke doc', title, 'ship')
        const text = await answer.innerText()
        if (!text.includes('Opens in Leaf')) throw new Error(`"${title}" is listed without saying it opens in Leaf: ${text.replace(/\n+/g, ' / ')}`)
      },
    },
    {
      name: 'Peek: a whole title typed as a sentence still finds the issue, and opens it',
      async run(t) {
        const issue = await runIssue(t)
        await findAndOpen(t, t.two, `Smoke run ${t.word} issue`, issue.title)
      },
    },
  ],
}
