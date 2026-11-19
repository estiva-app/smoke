/**
 * 6. Sign in, and still be signed in when the next app opens.
 *
 * What a person sees today: Smoke Test 2 arrives in a new browser that is signed in to Estiva ID only. Peek opens
 * signed in, with no sign-in screen, and its account menu names them; then Ship and Leaf, in the same browser, open
 * signed in too and show their name.
 * Each app turns Estiva ID's sign-in into its own on its first open, with no click.
 */
import { click, seeText } from '../lib/ui.mjs'

const NAME = 'Smoke Test 2'

export default {
  id: '6',
  title: 'Sign in, and still be signed in when the next app opens',
  steps: [
    {
      name: 'Peek, then Ship, then Leaf: each opens signed in, in one new browser',
      async run(t) {
        const me = await t.fresh(2)
        try {
          for (const app of ['peek', 'ship', 'leaf']) {
            // `open` fails when the app has not signed the account in within its deadline.
            const page = t.at(await me.open(app, '/'))
            if (app === 'peek') await signedInAs(page, NAME)
            else await seeText(page, NAME, { timeout: 60_000 })
          }
        } finally {
          await me.close()
        }
      },
    },
  ],
}

/** Peek shows only the account's initials in its corner; its account menu names the person. */
async function signedInAs(page, name) {
  await click(page, 'Account menu', { timeout: 60_000 })
  await seeText(page, name, { timeout: 10_000 })
  await page.keyboard.press('Escape')
}
