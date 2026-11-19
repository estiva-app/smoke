/** What a person does with a document in Leaf: make one in a team, and delete it again as its author. */
import { click, dOfPath, seeText, until } from './ui.mjs'

/** Make a document titled `title` in the team named `teamName` from Leaf's Home, as `me`. Returns its page and `d`. */
export async function makeDocument(t, me, teamName, title) {
  const page = t.at(await me.open('leaf', '/'))
  await click(page, 'New document', { timeout: 60_000 })
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('What is it about?').fill(title)
  await dialog.getByRole('combobox').last().click()
  await page.getByRole('option', { name: teamName, exact: true }).first().click()
  await dialog.getByRole('button', { name: 'Create' }).click()
  // Made, but it may not open: then it is found on Home by its title at the end and deleted, never left unreported.
  t.made(`the run's document "${title}", if it was made and did not open`, async () => {
    if (t.state.document) return
    const home = await me.open('leaf', '/')
    const href = await until(home, `"${title}" on Leaf's Home`,
      (title) => [...document.querySelectorAll('a[href^="/document/"]')].find((a) => a.innerText.startsWith(title))?.getAttribute('href') ?? null,
      title, 30_000).catch(() => null)
    if (href) await deleteDocument(me, { d: dOfPath(href), title })
  })
  const path = await until(page, `the new document "${title}" to open`, () => /^\/document\//.test(location.pathname) && location.pathname, undefined, 60_000)
  await seeText(page, title, { timeout: 60_000, scope: 'main' })
  return { page, d: dOfPath(path) }
}

/** Delete a document from its page in Leaf, as its author: More, Delete, and Leaf's question answered. */
export async function deleteDocument(me, doc) {
  const page = await me.open('leaf', `/document/${doc.d}`)
  await seeText(page, doc.title, { timeout: 90_000, scope: 'main' })
  const sent = me.stats.published.length
  await click(page, 'More')
  await click(page, /^Delete/)
  // Leaf asks first, and its question can draw a moment after the click: a run that looked at once sent nothing (19 Nov).
  // Should it stop asking, the check below still says whether the delete went out.
  const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog'))
  await confirm.getByRole('button', { name: /^Delete/ }).click({ timeout: 10_000 }).catch(() => {})
  await me.settled()
  // Proof it went out: an event that names this document, as a `deleted` field change or a kind:5.
  const after = me.stats.published.slice(sent)
  if (!after.some((e) => e.raw.includes(doc.d) && (e.kind === 5 || (e.kind === 1851 && e.raw.includes('deleted'))))) {
    throw new Error(`Leaf sent no delete for "${doc.title}" (it sent kinds: ${after.map((e) => e.kind).join(', ') || 'nothing'})`)
  }
}
