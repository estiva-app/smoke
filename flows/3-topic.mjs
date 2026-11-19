/**
 * 3. A topic shows its issue and its document in Peek, Ship and Leaf.
 *
 * What a person sees today: the standing topic "Smoke test" in the QA team (an initiative, in Peek's words). Peek
 * lists both files under Files in the topic's side panel; Ship's topic page lists the issue under Issues and the
 * document under Documents; Leaf's topic page lists both. Read only.
 */
import { openFile, peekPanel } from '../lib/apps.mjs'
import { seeText } from '../lib/ui.mjs'

const TOPIC = 'Smoke test'
const ISSUE = 'Smoke test: an issue with a picture'
const DOCUMENT = 'Smoke test: a document'

export default {
  id: '3',
  title: 'A topic shows its issue and its document in Peek, Ship and Leaf',
  steps: [
    {
      name: 'Peek: the topic\'s side panel lists the issue and the document',
      async run(t) {
        const page = await openFile(t, t.one, 'peek', 'topic', t.standing.initiative, TOPIC)
        await peekPanel(page)
        await seeText(page, ISSUE, { scope: '[data-topic-files]' })
        await seeText(page, DOCUMENT, { scope: '[data-topic-files]' })
      },
    },
    {
      name: 'Ship: the topic page lists the issue and the document',
      continues: true,
      async run(t) {
        const page = await openFile(t, t.one, 'ship', 'topic', t.standing.initiative, TOPIC)
        await seeText(page, ISSUE, { scope: 'main' })
        await seeText(page, DOCUMENT, { scope: 'main' })
      },
    },
    {
      name: 'Leaf: the topic page lists the issue and the document',
      continues: true,
      async run(t) {
        // The second account, so the first one's minute of requests is not spent on three apps at once.
        const page = await openFile(t, t.two, 'leaf', 'topic', t.standing.initiative, TOPIC)
        await seeText(page, ISSUE, { scope: 'main' })
        await seeText(page, DOCUMENT, { scope: 'main' })
      },
    },
  ],
}
