/**
 * The run's own issue: added in Ship with only a title by Smoke Test 1, used by flows 1, 4 and 5, and deleted at the
 * end of the run. Made once per run, by whichever flow needs it first.
 */
import { addIssue, findIssue } from './ship.mjs'
import { click, seeText } from './ui.mjs'

export async function runIssue(t) {
  if (t.state.issue) return t.state.issue
  const title = `Smoke run ${t.stamp}: an issue with no text`
  let made
  try {
    made = await addIssue(t.one, t.standing.team, 'Smoke test', title)
  } catch (error) {
    // It may exist although its row was not found: look for it once more at the end, and delete it if it is there.
    t.made(`the run's issue "${title}", if it was made`, async () => {
      const found = await findIssue(t.one, t.standing.team, title)
      if (found) await deleteIssue(t, { d: found, title })
    })
    throw error
  }
  const { page, d } = made
  t.at(page)
  t.state.issue = { d, title, addr: `30851:${t.one.pubkey}:${d}` }
  t.made(`the run's issue "${title}"`, () => deleteIssue(t, t.state.issue))
  return t.state.issue
}

/** Delete an issue from its page in Ship, as its author. */
export async function deleteIssue(t, issue) {
  const page = await t.one.open('ship', `/issue/${issue.d}`)
  await seeText(page, issue.title, { timeout: 90_000, scope: 'main' })
  const sent = t.one.stats.published.length
  await click(page, 'More actions')
  await click(page, 'Delete')
  // Ship asks first; its dialog can draw a moment after the click, and a run that did not wait sent nothing (19 Nov).
  await page.getByRole('alertdialog').or(page.getByRole('dialog')).getByRole('button', { name: /^Delete/ }).click({ timeout: 10_000 })
  await t.one.settled()
  // A delete is a `deleted` field change (kind 1851) since Ship reads issues by their fields (19 Nov, SPEC §6.5): it
  // goes to the team's Archived issues, where Restore undoes it. Before that it was a kind:5.
  // The event must name this issue, and as a field change it must be its `deleted` field: another tab's write is no proof.
  const after = t.one.stats.published.slice(sent)
  const deletes = (e) => e.raw.includes(issue.d) && (e.kind === 5 || (e.kind === 1851 && e.raw.includes('deleted')))
  if (!after.some(deletes)) {
    await page.screenshot({ path: `out/delete-${issue.d}.png` })
    throw new Error(`Ship sent no delete for "${issue.title}" (it sent kinds: ${after.map((e) => e.kind).join(', ') || 'nothing'}; out/delete-${issue.d}.png)`)
  }
}
