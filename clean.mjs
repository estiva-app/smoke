/**
 * Remove what a stopped run left behind; a run removes its own at the end, this is for one killed before it could.
 *
 *   node clean.mjs issue <d> "<title>"          delete a run issue, as Smoke Test 1
 *   node clean.mjs document <d> "<title>"       delete a run document, as Smoke Test 2
 *   node clean.mjs comment <n> <d> "<words>"    delete Smoke Test <n>'s comment on that issue
 *   node clean.mjs events <n> "<words>" [--yes] list Smoke Test <n>'s comments and messages containing the words
 *                                               (or with that event id);
 *                                               with --yes, delete them (for ones no app can reach any more, such as
 *                                               a comment on an issue that is already deleted)
 */
import { account, launch } from './lib/browser.mjs'
import { deleteShipComment } from './lib/comments.mjs'
import { deleteDocument } from './lib/leaf.mjs'
import { deleteIssue } from './lib/runIssue.mjs'
import { signerOf } from './lib/signer.mjs'

const [what, ...rest] = process.argv.slice(2)
const browser = await launch()
try {
  if (what === 'issue') {
    const [d, title] = rest
    await deleteIssue({ one: await account(browser, 1) }, { d, title })
  } else if (what === 'document') {
    const [d, title] = rest
    await deleteDocument(await account(browser, 2), { d, title })
  } else if (what === 'comment') {
    const [n, d, words] = rest
    await deleteShipComment(await account(browser, Number(n)), { d }, words)
  } else if (what === 'events') {
    const [n, words, yes] = rest
    // Empty words match every event, the standing comment included: listing them is fine, deleting them is not.
    if (yes === '--yes' && !/^[0-9a-f]{64}$/.test(words ?? '') && (words ?? '').trim().length < 8)
      throw new Error('clean.mjs events: --yes needs an event id or at least 8 characters of its words')
    const me = await account(browser, Number(n))
    const signer = await signerOf(me)
    const found = (await signer.query([{ kinds: [1111, 9, 11], authors: [me.pubkey], limit: 500 }])).filter((e) => e.id === words || e.content.includes(words))
    for (const event of found) {
      console.log(`${event.id} kind ${event.kind} ${new Date(event.created_at * 1000).toISOString()} "${event.content.slice(0, 80)}"`)
      if (yes === '--yes') console.log(`  delete: ${JSON.stringify(await signer.remove(event)).slice(0, 160)}`)
    }
    if (!found.length) console.log('none found')
  } else throw new Error('usage: clean.mjs issue <d> "<title>" | document <d> "<title>" | comment <n> <d> "<words>" | events <n> "<words>" [--yes]')
  console.log(`removed ${what} ${rest.join(' ')}`)
} finally {
  await browser.close()
}
