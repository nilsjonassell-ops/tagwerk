// Oberflächen-Test gegen die Web-Vorschau (out/web): npm run build:web && npm run test:e2e
// Prüft Menüs, Auswahlfelder, Dialoge und Erscheinungsbild im echten Browser (Playwright).
const { chromium } = require('playwright')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '../../out/web')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const only = process.argv[2]

let fails = 0
const ok = (c, m) => {
  console.log((c ? 'OK   ' : 'FAIL ') + m)
  if (!c) fails++
}

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      let f = path.join(ROOT, p)
      if (!f.startsWith(ROOT)) return res.writeHead(403).end()
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html')
      if (!fs.existsSync(f)) f = path.join(ROOT, 'index.html')
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' })
      fs.createReadStream(f).pipe(res)
    })
    srv.listen(0, '127.0.0.1', () => resolve(srv))
  })
}

async function start(browser, url, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1280, height: 820 }, colorScheme: opts.scheme ?? 'light' })
  const p = await ctx.newPage()
  p.errors = []
  p.on('pageerror', (e) => p.errors.push(e.message))
  p.on('console', (m) => m.type() === 'error' && p.errors.push(m.text()))
  await p.goto(url)
  await p.waitForSelector('.app, .dialog', { timeout: 15000 })
  const go = p.locator('button:has-text("Loslegen")')
  if (await go.count()) await go.first().click()
  await p.waitForSelector('.app')
  await sleep(500)
  return p
}

/** Liegt das Element vollständig im sichtbaren Fenster? */
async function inViewport(p, sel) {
  return p.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
  }, sel)
}

async function openFirstMail(p) {
  await p.keyboard.press('Control+3')
  await p.waitForSelector('.mail-card')
  await p.locator('.mail-card').nth(1).click()
  await p.waitForSelector('button:has-text("Übernehmen")')
}

const tests = {
  async menu(b, url) {
    const p = await start(b, url)
    await openFirstMail(p)
    const trigger = p.locator('button:has-text("Übernehmen")')
    await trigger.click()
    await sleep(250)
    ok(await p.locator('#layer-root [role="menu"]').count() === 1, 'Menü liegt in der obersten Ebene (#layer-root)')
    ok(await inViewport(p, '#layer-root [role="menu"]'), 'Menü vollständig sichtbar')
    await p.keyboard.press('ArrowDown')
    const focused = await p.evaluate(() => document.activeElement?.getAttribute('role'))
    ok(focused === 'menuitem', 'Pfeiltaste setzt den Fokus auf einen Menüeintrag')
    await p.keyboard.press('Escape')
    await sleep(250)
    ok(await p.locator('[role="menu"]').count() === 0, 'Esc schließt das Menü')
    ok(await trigger.evaluate((el) => el === document.activeElement), 'Fokus zurück auf dem Auslöser')
    await trigger.click()
    await sleep(200)
    await p.mouse.click(5, 400)
    await sleep(250)
    ok(await p.locator('[role="menu"]').count() === 0, 'Klick daneben schließt das Menü')
    // Während die Seitenleiste animiert
    await p.keyboard.press('Control+b')
    await trigger.click()
    await sleep(80)
    await p.locator('[role="menuitem"]:has-text("Termin daraus")').click()
    await sleep(400)
    ok(await p.locator('.dialog').count() === 1, 'Menüeintrag während der Seitenleisten-Animation klickbar')
    ok(p.errors.length === 0, `keine Konsolenfehler (${p.errors.join(' | ')})`)
    await p.context().close()
  },

  async edge(b, url) {
    const p = await start(b, url, { viewport: { width: 860, height: 560 } })
    await openFirstMail(p)
    const t = p.locator('button[aria-label="Wiedervorlage"]')
    await t.click()
    await sleep(250)
    ok(await inViewport(p, '#layer-root [role="menu"]'), 'Menü am rechten Rand bleibt im Fenster (klappt um/verschiebt sich)')
    await p.keyboard.press('Escape')
    await p.context().close()
  },

  async select(b, url) {
    const p = await start(b, url, { scheme: 'dark' })
    await p.keyboard.press('Control+,')
    await p.waitForSelector('.settings-nav')
    const combo = p.locator('[role="combobox"][aria-label="Erscheinungsbild"]')
    ok(await combo.count() === 1, 'Erscheinungsbild ist eine eigene Auswahl (combobox)')
    await combo.focus()
    await p.keyboard.press('Enter')
    await sleep(200)
    ok(await p.locator('#layer-root [role="listbox"]').count() === 1, 'Liste öffnet in der obersten Ebene')
    await p.keyboard.press('ArrowDown')
    await p.keyboard.press('Enter')
    await sleep(250)
    ok((await p.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'Tastatur: Enter ↓ Enter wählt „Hell“')
    ok(await combo.evaluate((el) => el === document.activeElement), 'Fokus zurück auf der Auswahl')
    await p.keyboard.press('Enter')
    await sleep(200)
    await p.keyboard.press('Escape')
    await sleep(250)
    ok(await p.locator('#layer-root [role="listbox"]').count() === 0, 'Esc schließt die offene Liste …')
    ok(await p.locator('.settings-nav').count() === 1, '… aber nicht den Einstellungsdialog dahinter')
    await p.context().close()
  },

  async noNative(b, url) {
    const p = await start(b, url)
    const count = () => p.evaluate(() => document.querySelectorAll('select').length)
    const seen = {}
    for (const [k, name] of [['Control+1', 'Heute'], ['Control+2', 'Kalender'], ['Control+3', 'Posteingang'], ['Control+4', 'Aufgaben'], ['Control+5', 'Notizen'], ['Control+6', 'Projekte']]) {
      await p.keyboard.press(k)
      await sleep(500)
      seen[name] = await count()
    }
    await p.keyboard.press('Control+4')
    await sleep(400)
    await p.locator('.task-row').first().click()
    await sleep(500)
    seen['Aufgaben-Detail'] = await count()
    await p.keyboard.press('Control+,')
    await p.waitForSelector('.settings-nav')
    for (const btn of await p.locator('.settings-nav button').all()) {
      await btn.click()
      await sleep(250)
      seen['Einstellungen ' + (await btn.innerText()).trim()] = await count()
    }
    await p.keyboard.press('Escape')
    await sleep(300)
    await p.keyboard.press('Control+Shift+F')
    await sleep(600)
    seen['Fokus'] = await count()
    const bad = Object.entries(seen).filter(([, n]) => n > 0)
    ok(bad.length === 0, `keine nativen <select> (${bad.map(([k, n]) => `${k}: ${n}`).join(', ') || 'alle 0'})`)
    await p.context().close()
  }
}

;(async () => {
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
    console.error('out/web fehlt – zuerst npm run build:web')
    process.exit(2)
  }
  const srv = await serve()
  const url = `http://127.0.0.1:${srv.address().port}/`
  const b = await chromium.launch()
  for (const [name, fn] of Object.entries(tests)) {
    if (only && only !== name) continue
    console.log(`— ${name}`)
    try {
      await fn(b, url)
    } catch (e) {
      ok(false, `${name}: ${e.message.split('\n')[0]}`)
    }
  }
  await b.close()
  srv.close()
  console.log(fails ? `${fails} fehlgeschlagen` : 'alle bestanden')
  process.exit(fails ? 1 : 0)
})()
