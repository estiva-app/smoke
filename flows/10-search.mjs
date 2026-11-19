/**
 * 10. Search finds the issue and the document by title.
 *
 * What a person sees today: Peek is the app with a search box ("Search Peek...", Ctrl+K); Ship and Leaf search only
 * inside their `[` link list. Smoke Test 2 types the start of the run's issue's title, and the issue is among the
 * answers; choosing it opens it. The same for the run's document (flow 9's; alone, this flow searches the standing
 * one). Search matches the starts of words, so the run's titles carry a word of their own.
 */
import { runIssue } from '../lib/runIssue.mjs'
import { click, seeText } from '../lib/ui.mjs'

const STANDING_DOCUMENT = 'Smoke test: a document'

/** Search Peek for `query` as `me`, choose the answer titled `title`, and wait for it to open. */
async function findAndOpen(t, me, query, title) {
  const page = t.at(await me.open('peek', '/'))
  await click(page, 'Search Peek', { timeout: 60_000 })
  const box = page.getByRole('combobox', { name: /^Search Peek/ })
  await box.fill(query)
  const answer = page.getByRole('option').filter({ hasText: title }).first()
  await answer.waitFor({ timeout: 30_000 }).catch(async () => {
    const offered = await page.getByRole('option').allInnerTexts().catch(() => [])
    throw new Error(`no "${title}" among the answers for "${query}"; it offered: ${offered.map((o) => o.split('\n')[0]).slice(0, 6).join(' / ') || 'nothing'}`)
  })
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
        await findAndOpen(t, t.two, `Smoke run ${t.word}`, issue.title)
      },
    },
    {
      name: 'Peek: search finds the document by the start of its title, and opens it',
      async run(t) {
        const doc = t.state.document
        await findAndOpen(t, t.two, doc ? `Smoke run ${t.word}` : 'Smoke test: a doc', doc?.title ?? STANDING_DOCUMENT)
      },
    },
  ],
}
