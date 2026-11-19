/**
 * 8. Ship: make an issue, change its status, comment.
 *
 * What a person sees today: Smoke Test 1 adds the run's issue in Ship (flow 1 does, when it runs first). Smoke Test 2
 * sets its Status from Todo to In Progress and comments on it (flow 4's comment, when it ran). Opened again, the issue
 * shows In Progress and the comment. The run deletes the issue and the comment.
 */
import { commentInShip } from '../lib/comments.mjs'
import { runIssue } from '../lib/runIssue.mjs'
import { seeText, until } from '../lib/ui.mjs'

const STATUS = 'In Progress'

export default {
  id: '8',
  title: 'Ship: an issue made, its status changed and a comment added',
  steps: [
    {
      name: 'Ship: Smoke Test 1 adds an issue',
      async run(t) {
        await runIssue(t)
      },
    },
    {
      name: `Ship: Smoke Test 2 sets its status to ${STATUS}`,
      async run(t) {
        const issue = t.state.issue
        const page = t.at(await t.two.open('ship', `/issue/${issue.d}`))
        await seeText(page, issue.title, { timeout: 90_000, scope: 'main' })
        await page.getByRole('combobox', { name: 'Status' }).or(page.getByRole('button', { name: 'Status' })).first().click({ timeout: 30_000 })
        await page.getByRole('option', { name: STATUS }).or(page.getByRole('menuitemradio', { name: STATUS })).or(page.getByRole('menuitem', { name: STATUS })).first().click({ timeout: 10_000 })
        await t.two.settled()
      },
    },
    {
      name: 'Ship: Smoke Test 2 comments on it',
      async run(t) {
        // Flow 4 has Smoke Test 2 comment on this issue while it is open next door; alone, this flow comments itself.
        if (t.state.liveSent) return
        t.state.liveWords = `A comment from Smoke Test 2 in Ship, ${t.stamp}.`
        await commentInShip(t, t.two, t.state.issue, t.state.liveWords)
        t.state.liveSent = true
      },
    },
    {
      name: `Ship: opened again, the issue shows ${STATUS} and the comment`,
      async run(t) {
        const issue = t.state.issue
        const page = t.at(await t.two.open('ship', `/issue/${issue.d}`))
        await seeText(page, issue.title, { timeout: 90_000, scope: 'main' })
        await until(page, `the Status to read "${STATUS}"`,
          (status) => [...document.querySelectorAll('[aria-label="Status"]')].some((el) => el.innerText.trim() === status), STATUS, 30_000)
        await seeText(page, t.state.liveWords, { timeout: 60_000, scope: 'main, aside' })
      },
    },
  ],
}
