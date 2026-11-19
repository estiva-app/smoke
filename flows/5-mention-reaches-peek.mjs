/**
 * 5. A mention in a Ship comment reaches the mentioned person in Peek.
 *
 * What a person sees today: Smoke Test 2 mentions Smoke Test 1 in a comment on the run's issue in Ship. Smoke Test 1
 * opens Peek's Desk and finds the comment there, naming them.
 */
import { commentInShip } from '../lib/comments.mjs'
import { runIssue } from '../lib/runIssue.mjs'
import { seeText } from '../lib/ui.mjs'

export default {
  id: '5',
  title: 'A mention in a Ship comment reaches the person in Peek',
  steps: [
    {
      name: 'Ship: Smoke Test 2 mentions Smoke Test 1 in a comment',
      async run(t) {
        const issue = await runIssue(t)
        // Smoke Test 1 looks elsewhere first: a mention that arrives while they have the issue open (flow 4 leaves it
        // open in Peek and Leaf) is read on arrival, and rightly not on their Desk (19 Nov).
        await t.one.open('peek', '/')
        await t.one.open('leaf', '/')
        t.state.mentionWords = `A mention from Smoke Test 2, ${t.stamp}, for`
        await commentInShip(t, t.two, issue, t.state.mentionWords, { mention: 'Smoke Test 1' })
      },
    },
    {
      name: 'Peek: the mention is on Smoke Test 1\'s Desk',
      async run(t) {
        const page = t.at(await t.one.open('peek', '/'))
        await seeText(page, t.state.mentionWords, { timeout: 60_000 })
      },
    },
  ],
}
