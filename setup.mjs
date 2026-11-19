/**
 * Make the smoke test's standing files, once, through the apps as a person would, and write their addresses to
 * `standing.json`: `node setup.mjs <stage>`, stages in order — project, issue, picture, comment, document, topic.
 * Each stage is skipped when `standing.json` already has what it makes. All live in the QA team.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { account, launch } from './lib/browser.mjs'
import { addIssue, projectD } from './lib/ship.mjs'
import { click, dOfPath, pastePicture, seeText, until } from './lib/ui.mjs'

const ISSUE_TITLE = 'Smoke test: an issue with a picture'
const ISSUE_TEXT = 'A standing issue the smoke test opens in Peek, Ship and Leaf after every deploy.'
export const STANDING_COMMENT = 'A standing comment the smoke test reads in every app.'
const DOCUMENT_TITLE = 'Smoke test: a document'
const TOPIC_TITLE = 'Smoke test'
const DOCUMENT_TEXT = 'A standing document the smoke test opens in Peek, Ship and Leaf after every deploy.'

export const QA_TEAM = 'a78e60b1-a41f-48c9-bcb0-6ceacdee8c69'
const FILE = new URL('./standing.json', import.meta.url)
const standing = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { team: QA_TEAM }
const save = () => writeFileSync(FILE, `${JSON.stringify(standing, null, 2)}\n`)

const stage = process.argv[2]
const browser = await launch()
try {
  const one = await account(browser, 1)
  if (stage === 'project' && !standing.project) {
    const page = await one.open('ship', `/app/teams/${QA_TEAM}/projects`)
    await click(page, 'Add project')
    await page.getByPlaceholder('New project title').fill('Smoke test')
    await page.getByPlaceholder('What is it for, in a sentence?').fill('The files the smoke test after every deploy opens in every app; nothing to do here.')
    await page.getByPlaceholder('ABC').fill('SMK')
    await click(page, 'Create project')
    standing.project = `30850:${one.pubkey}:${await projectD(page, 'Smoke test')}`
    save()
  }
  if (stage === 'issue' && !standing.issue) {
    const { d } = await addIssue(one, QA_TEAM, 'Smoke test', ISSUE_TITLE)
    standing.issue = `30851:${one.pubkey}:${d}`
    save()
  }
  if (stage === 'picture') {
    // The issue's text and its picture, written in Ship's description editor; Ship saves on blur.
    const page = await one.open('ship', `/issue/${standing.issue.split(':')[2]}`)
    await seeText(page, 'Smoke test: an issue with', { timeout: 90_000 })
    if (process.argv[3] === 'retitle') {
      await page.locator('[contenteditable][aria-label="Title"]').click()
      await page.keyboard.press('Control+A')
      await page.keyboard.type(ISSUE_TITLE)
    }
    await page.locator('[contenteditable][aria-label="Description"]').click({ timeout: 60_000 })
    await page.keyboard.type(ISSUE_TEXT)
    await page.keyboard.press('Enter')
    await pastePicture(page, 'smoke-picture.png', readFileSync(new URL('./fixtures/smoke-picture.png', import.meta.url)).toString('base64'))
    await page.waitForTimeout(8000)
    await page.locator('h1').first().click()
    await page.waitForTimeout(8000)
    await page.screenshot({ path: 'out/setup-picture.png' })
  }
  if (stage === 'comment') {
    // The standing conversation: one comment by the second account, which every app's issue view should show.
    const two = await account(browser, 2)
    const page = await two.open('ship', `/issue/${standing.issue.split(':')[2]}`)
    await seeText(page, ISSUE_TITLE, { timeout: 90_000 })
    await page.locator('[contenteditable][aria-label^="Start a conversation"]').click()
    await page.keyboard.type(STANDING_COMMENT)
    await page.keyboard.press('Enter')
    await seeText(page, STANDING_COMMENT, { scope: 'aside, [role=complementary], main' })
    await two.settled()
  }
  if (stage === 'document' && !standing.document) {
    const page = await one.open('leaf', `/new?folder=${QA_TEAM}`)
    await page.getByRole('dialog').getByLabel('Title').fill(DOCUMENT_TITLE, { timeout: 90_000 }).catch(async (error) => {
      await page.screenshot({ path: 'out/setup-document-failed.png' })
      throw error
    })
    await click(page, 'Create', { exact: true })
    const path = await until(page, 'the new document to open', () => (location.pathname.startsWith('/document/') ? location.pathname : null), null, 90_000)
    standing.document = `30842:${one.pubkey}:${dOfPath(path)}`
    save()
  }
  if (stage === 'doctext') {
    const page = await one.open('leaf', `/document/${standing.document.split(':')[2]}`)
    await page.locator('[contenteditable][aria-label="Document"]').click({ timeout: 90_000 })
    await page.keyboard.type(DOCUMENT_TEXT)
    await page.waitForTimeout(8000)
    await page.screenshot({ path: 'out/setup-document.png' })
  }
  if (stage === 'room' && !standing.room) {
    const page = await one.open('peek', `/app/teams/${QA_TEAM}`)
    const sent = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && /\/(events|sign)\b/.test(r.url())) sent.push(`${r.url()} ${(r.postData() ?? '').slice(0, 400)}`)
    })
    page.on('websocket', (ws) => ws.on('framesent', ({ payload }) => String(payload).startsWith('["EVENT"') && sent.push(String(payload).slice(0, 400))))
    process.on('exit', () => console.error(sent.join('\n')))
    await click(page, 'New topic in QA: QA', { timeout: 60_000 })
    await page.getByPlaceholder('What is it about?').fill(TOPIC_TITLE)
    await page.getByPlaceholder('What is it for, in a sentence?').fill('Where the smoke test after every deploy keeps its issue and document; nothing to read here.')
    await click(page, 'Start')
    const path = await until(page, 'the new topic to open', () => (location.pathname.startsWith('/topic/') ? location.pathname : null), null, 90_000)
    standing.room = `30840:${one.pubkey}:${dOfPath(path)}`
    save()
  }
  if (stage === 'initiative' && !standing.initiative) {
    // What Ship and Leaf call a topic is an initiative in Peek: the one object all three list (Peek's team rooms,
    // like `room`, stay in Peek).
    const page = await one.open('peek', '/app/initiatives')
    await click(page, 'New initiative', { timeout: 60_000 })
    await page.getByPlaceholder('What is it about?').fill(TOPIC_TITLE)
    await page.getByPlaceholder('What is it for, in a sentence?').fill('Where the smoke test after every deploy keeps its issue and document; nothing to read here.')
    await page.getByRole('dialog').getByRole('combobox', { name: 'Team' }).or(page.getByRole('dialog').getByRole('button', { name: 'Team' })).first().click()
    await page.getByRole('option', { name: 'QA', exact: true }).click()
    await click(page, 'Start')
    const path = await until(page, 'the new initiative to open', () => (location.pathname.startsWith('/topic/') ? location.pathname : null), null, 90_000)
    standing.initiative = `30840:${one.pubkey}:${dOfPath(path)}`
    save()
  }
  if (stage === 'topicfiles') {
    // Add the issue and the document to the topic from its side panel, as add-files.sh did (TOP-3).
    const page = await one.open('peek', `/topic/${standing.initiative}`)
    await click(page, 'Show side panel', { timeout: 90_000 })
    for (const words of [ISSUE_TITLE, DOCUMENT_TITLE]) {
      await click(page, 'Add file')
      await page.keyboard.type(words)
      await page.getByRole('option', { name: words }).first().click({ timeout: 60_000 })
      await page.waitForTimeout(4000)
    }
    await page.screenshot({ path: 'out/setup-topic.png' })
  }
  await one.settled()
  console.log(JSON.stringify(standing, null, 2))
} finally {
  await browser.close()
}
