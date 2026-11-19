/**
 * What a step does with a page, as a person would: find by the words on screen, click by label, wait for words.
 * Every wait has a deadline and says what it waited for when it runs out.
 */

/** Wait until `fn` (run in the page with `arg`) is truthy; return its value. */
export async function until(page, what, fn, arg, timeout = 30_000) {
  try {
    const handle = await page.waitForFunction(fn, arg, { timeout, polling: 250 })
    return handle.jsonValue()
  } catch (error) {
    if (error.name === 'TimeoutError') throw new Error(`waited ${timeout / 1000} s for ${what}`)
    throw new Error(`while waiting for ${what}: ${error.message.split('\n')[0]}`)
  }
}

/** Wait for `text` anywhere in the page's visible text (within `scope`, a CSS selector, if given). */
export function seeText(page, text, { timeout = 30_000, scope = 'body' } = {}) {
  return until(page, `"${text}" on ${new URL(page.url()).host}${new URL(page.url()).pathname}`,
    ({ text, scope }) => [...document.querySelectorAll(scope)].some((el) => el.innerText.includes(text)), { text, scope }, timeout)
}

/** Click the first visible button or link named `label`. */
export async function click(page, label, { exact = false, timeout = 30_000 } = {}) {
  const target = ['button', 'link', 'menuitem', 'tab', 'option']
    .map((role) => page.getByRole(role, { name: label, exact }))
    .reduce((a, b) => a.or(b))
  try {
    await target.first().click({ timeout })
  } catch {
    throw new Error(`no "${label}" to click on ${new URL(page.url()).pathname}`)
  }
}

/** The page's visible text. */
export function text(page, scope = 'body') {
  return page.locator(scope).first().innerText()
}

/** Paste a PNG into the focused editor, as a screenshot on the clipboard arrives. */
export function pastePicture(page, name, base64) {
  return page.evaluate(({ name, base64 }) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const data = new DataTransfer()
    data.items.add(new File([bytes], name, { type: 'image/png' }))
    const target = document.activeElement ?? document.body
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, { name, base64 })
}

/** The `d` of a file's link `/<word>/<slug>-<d>`: the uuid at its end. */
export function dOfPath(pathname) {
  return /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/.exec(pathname)?.[1] ?? null
}
