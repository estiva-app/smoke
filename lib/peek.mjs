/** What a person does in Peek's team room, shared by the flows: write a message, and delete it again as its author. */
import { dOf } from './apps.mjs'
import { click, seeText } from './ui.mjs'

/** Peek's composer is named for its topic: the standing room is "Smoke test". */
export const BOX = 'main [contenteditable=true][aria-label="Smoke test"]'

export async function deleteMessage(me, room, words) {
  const page = await me.open('peek', `/topic/${dOf(room)}`)
  await seeText(page, words, { timeout: 90_000 })
  // The message's own menu, never the topic's "More actions" in the header: that one deletes the topic (19 Nov).
  const message = page.getByText(words).first()
  await message.hover()
  // Its row's buttons, on hover: React, Reply, Resolve, More actions.
  const row = message.locator('xpath=ancestor::*[.//button[@aria-label="React"]][1]')
  await row.getByRole('button', { name: 'More actions' }).click()
  await click(page, /^Delete/)
  const confirm = page.getByRole('alertdialog')
  if (await confirm.count()) await confirm.getByRole('button', { name: /^Delete/ }).click()
  await me.settled()
}
