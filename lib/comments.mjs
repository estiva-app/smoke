/** Commenting on an issue in Ship, and deleting the comment again, as its author. */
import { click, seeText, until } from './ui.mjs'

const BOX = '[contenteditable][aria-label^="Start a conversation"]'

/**
 * `me` comments `words` on the issue in Ship; `mention` (a display name) is picked from the @ list first. The run
 * deletes the comment at its end.
 */
export async function commentInShip(t, me, issue, words, { mention } = {}) {
  const page = t.at(await me.open('ship', `/issue/${issue.d}`))
  await seeText(page, issue.title, { timeout: 90_000, scope: 'main' })
  await steadyBox(page)
  await page.locator(BOX).click({ timeout: 60_000 })
  await page.keyboard.type(words)
  const typed = await page.locator(BOX).innerText()
  if (!typed.includes(words)) throw new Error(`the comment box kept "${typed.trim()}" of "${words}"`)
  // The mention goes last: typing on after a picked mention stopped at "2026-" and sent what it had (19 Nov).
  if (mention) {
    await page.keyboard.type(' ')
    await page.keyboard.type(`@${mention.split(' ')[0]}`)
    // The list redraws as people load, so a click can land on an option that has just gone: try again.
    for (let attempt = 1; ; attempt++) {
      // The list is the team's roster once their profiles load; late in a full run that took over 30 s (19 Nov).
      await until(page, `"${mention}" in the mention list`, (name) => [...document.querySelectorAll('[role=option]')].some((o) => o.textContent.includes(name)), mention, 60_000)
        .catch(async (error) => {
          const offered = await page.getByRole('option').allInnerTexts().catch(() => [])
          throw new Error(`${error.message}; the list offered: ${offered.length ? offered.join(', ') : 'nothing'}`)
        })
      try {
        await page.getByRole('option', { name: mention }).first().click({ timeout: 5_000 })
        break
      } catch (error) {
        if (attempt === 3) throw error
      }
    }
  }
  // Registered as it is sent, so a comment that went out but drew wrong is still deleted; an unsent draft is not.
  t.made(`Smoke Test ${me.n}'s comment "${words}"`, () => deleteShipComment(me, issue, words))
  // After a picked mention Enter did not send (19 Nov); the box's Send button does, either way.
  await page.locator(BOX).locator('xpath=ancestor::*[.//button[@aria-label="Send"]][1]').getByRole('button', { name: 'Send' }).click({ timeout: 10_000 })
  await seeText(page, words, { scope: 'main, aside' })
  await me.settled()
}

/**
 * Type into Ship's comment box the moment it can be clicked, as someone who opens an issue to answer it does, and
 * check every letter stayed. Clears the box again; nothing is sent.
 */
export async function typeOnArrival(t, me, issue, words) {
  const page = t.at(await me.open('ship', `/issue/${issue.d}`))
  await page.locator(BOX).click({ timeout: 90_000 })
  await page.keyboard.type(words, { delay: 40 })
  const kept = (await page.locator(BOX).innerText()).trim()
  await page.locator(BOX).click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Backspace')
  if (!kept.includes(words)) throw new Error(`the comment box kept "${kept}" of "${words}"`)
}

/**
 * Wait until Ship's comment box has stayed the same element for 2 s. Ship replaces the box a second or two after it
 * first draws, taking the focus and whatever is typed next with it (19 Nov, filed in Ship: Feedback & Bugs).
 */
async function steadyBox(page) {
  await page.locator(BOX).waitFor({ timeout: 60_000 })
  const end = Date.now() + 30_000
  while (Date.now() < end) {
    await page.locator(BOX).evaluate((box) => { box.dataset.smokeSteady = '1' })
    await page.waitForTimeout(2000)
    if (await page.locator(`${BOX}[data-smoke-steady="1"]`).count()) return
  }
  throw new Error('Ship\'s comment box kept being replaced for 30 s')
}

export async function deleteShipComment(me, issue, words) {
  const page = await me.open('ship', `/issue/${issue.d}`)
  await seeText(page, words, { timeout: 90_000, scope: 'main, aside' })
  const comment = page.getByText(words).first()
  await comment.hover()
  // This comment's own menu: the page's first "Message actions" belongs to whichever comment is listed first (19 Nov).
  await comment.locator('xpath=ancestor::*[.//button[@aria-label="Message actions"]][1]').getByRole('button', { name: 'Message actions' }).click({ timeout: 10_000 })
  await click(page, 'Delete message')
  const confirm = page.getByRole('alertdialog')
  await confirm.getByRole('button', { name: /^Delete/ }).click({ timeout: 10_000 })
  await me.settled()
  await until(page, `"${words}" to be gone`, (words) => ![...document.querySelectorAll('main, aside')].some((el) => el.innerText.includes(words)), words, 30_000)
}
