/** What a person does in Ship, shared by the setup and the flows. */
import { click, dOfPath, until } from './ui.mjs'

/**
 * Add an issue with only a title to `projectTitle`, from the team's Issues page, as a person does. Returns its `d`.
 * Ship stays on the list, so the new issue is found by its row's link.
 */
export async function addIssue(me, team, projectTitle, title) {
  const page = await me.open('ship', `/app/teams/${team}/issues`)
  await click(page, 'Add issue', { timeout: 60_000 })
  await page.getByPlaceholder('Issue title').fill(title)
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('combobox', { name: 'Project' }).click()
  await page.getByRole('option', { name: projectTitle }).first().click()
  await click(page, 'Create issue')
  // The list opens on "Assigned to me"; the new issue is assigned to nobody.
  await page.getByPlaceholder('Issue title').waitFor({ state: 'detached', timeout: 30_000 })
  await click(page, 'All')
  const href = await until(page, `the row of "${title}"`,
    (title) => [...document.querySelectorAll('a[href*="/issue/"]')].find((a) => a.innerText.includes(title))?.getAttribute('href') ?? null,
    title, 60_000)
  return { page, d: dOfPath(new URL(href, page.url()).pathname) }
}

/** Find a project's row link on the team's Projects page by its title; returns its `d`. */
export async function projectD(page, title) {
  const href = await until(page, `the project "${title}"`,
    (title) => [...document.querySelectorAll('a[href*="/project/"]')].find((a) => a.innerText.trim().startsWith(title))?.getAttribute('href') ?? null,
    title, 60_000)
  return dOfPath(new URL(href, page.url()).pathname)
}
