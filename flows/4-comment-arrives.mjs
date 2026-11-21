/**
 * 4. A second person comments on the issue in Ship, and the first sees it arrive in Peek and Leaf without reloading.
 *
 * What a person sees today: Smoke Test 1 has the run's issue open in Peek and in Leaf. Smoke Test 2 comments on it in
 * Ship. The comment appears in Peek's conversation and in Leaf's Comments within seconds, with no reload. Typing the
 * moment Ship's comment box shows loses letters, because Ship redraws the box (known since 19 Nov).
 */
import { commentInShip, typeOnArrival } from '../lib/comments.mjs'
import { runIssue } from '../lib/runIssue.mjs'
import { seeText } from '../lib/ui.mjs'

/** How long a live comment may take to arrive. */
const LIVE_MS = 20_000

export default {
  id: '4',
  title: 'A second person\'s comment arrives in Peek and Leaf without reloading',
  steps: [
    {
      name: 'Peek and Leaf: Smoke Test 1 has the issue open',
      async run(t) {
        const issue = await runIssue(t)
        const peek = t.at(await t.one.open('peek', `/issue/${issue.d}`))
        await seeText(peek, issue.title, { timeout: 90_000 })
        const leaf = t.at(await t.one.open('leaf', `/issue/${issue.d}`))
        await seeText(leaf, issue.title, { timeout: 90_000, scope: 'main' })
        t.state.held = { peek, leaf }
      },
    },
    {
      name: 'Ship: typing in the comment box as soon as it shows keeps every letter',
      continues: true,
      async run(t) {
        await typeOnArrival(t, t.two, t.state.issue, 'Typed as soon as the box showed')
      },
    },
    {
      name: 'Ship: Smoke Test 2 comments on the issue',
      async run(t) {
        t.state.liveWords = `A comment from Smoke Test 2, ${t.stamp}.`
        await commentInShip(t, t.two, t.state.issue, t.state.liveWords)
        // Flow 8 checks this comment instead of making its own: only once it was really sent.
        t.state.liveSent = true
        t.state.livePostedAt = Date.now()
      },
    },
    {
      name: 'Peek: the comment arrives without reloading',
      continues: true,
      async run(t) {
        const page = t.at(t.state.held.peek)
        await seeText(page, t.state.liveWords, { timeout: LIVE_MS })
      },
    },
    {
      name: 'Leaf: the comment arrives without reloading',
      continues: true,
      async run(t) {
        const page = t.at(t.state.held.leaf)
        await seeText(page, t.state.liveWords, { timeout: Math.max(1000, LIVE_MS - (Date.now() - t.state.livePostedAt)) })
      },
    },
  ],
}
