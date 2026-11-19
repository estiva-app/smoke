/**
 * Look at a screen as a smoke account, for writing a flow: `node explore.mjs <1|2> <peek|ship|leaf> <path>
 * [--wait ms] [--js expr]… [--shot file]`. Prints the page's text, then each `--js` result.
 */
import { account, launch } from './lib/browser.mjs'
import { click } from './lib/ui.mjs'

const [n, app, path, ...rest] = process.argv.slice(2)
const options = { wait: 8000, js: [], shot: null, click: [] }
for (let i = 0; i < rest.length; i += 2) {
  const [name, value] = [rest[i].slice(2), rest[i + 1]]
  if (name === 'js' || name === 'click') options[name].push(value)
  else options[name] = value
}
const browser = await launch()
try {
  const me = await account(browser, Number(n))
  const page = await me.open(app, path)
  await page.waitForTimeout(Number(options.wait))
  if (options.hover) {
    await page.getByText(options.hover).first().hover()
    await page.waitForTimeout(1500)
  }
  for (const label of options.click) {
    await click(page, label)
    await page.waitForTimeout(3000)
  }
  console.log(page.url())
  console.log((await page.locator('body').innerText()).slice(0, 4000))
  for (const expr of options.js) console.log('>>', JSON.stringify(await page.evaluate(expr)).slice(0, 3000))
  if (options.shot) await page.screenshot({ path: options.shot })
  console.log('stats', JSON.stringify(me.stats))
} finally {
  await browser.close()
}
