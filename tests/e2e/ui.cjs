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
    await trigger.click()
    await sleep(200)
    await trigger.click()
    await sleep(250)
    ok(await p.locator('[role="menu"]').count() === 0, 'Zweiter Klick auf den Auslöser schließt das Menü')
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
    const p = await start(b, url)
    await p.keyboard.press('Control+,')
    await p.waitForSelector('.settings-nav')
    await p.locator('.settings-nav button:has-text("Kalender")').click()
    const combo = p.locator('[role="combobox"][aria-label="Freie Zeit anzeigen ab"]')
    ok(await combo.count() === 1, 'Auswahlfeld ist eine eigene Auswahl (combobox)')
    const before = (await combo.innerText()).trim()
    await combo.focus()
    await p.keyboard.press('Enter')
    await sleep(200)
    ok(await p.locator('#layer-root [role="listbox"]').count() === 1, 'Liste öffnet in der obersten Ebene')
    await p.keyboard.press('ArrowDown')
    await p.keyboard.press('Enter')
    await sleep(250)
    ok(before === '60 Minuten' && (await combo.innerText()).trim() === '90 Minuten', `Tastatur: Enter ↓ Enter wählt den nächsten Wert (${before} → ${(await combo.innerText()).trim()})`)
    ok(await combo.evaluate((el) => el === document.activeElement), 'Fokus zurück auf der Auswahl')
    await p.keyboard.press('Enter')
    await sleep(200)
    await p.keyboard.press('Escape')
    await sleep(250)
    ok(await p.locator('#layer-root [role="listbox"]').count() === 0, 'Esc schließt die offene Liste …')
    ok(await p.locator('.settings-nav').count() === 1, '… aber nicht den Einstellungsdialog dahinter')
    await p.context().close()
  },

  async appearance(b, url) {
    const p = await start(b, url)
    await p.keyboard.press('Control+,')
    await p.waitForSelector('.settings-nav')
    const tabs = (await p.locator('.settings-nav button').allInnerTexts()).map((t) => t.trim())
    const want = ['Darstellung', 'Allgemein', 'Übersicht', 'Kalender', 'Benachrichtigungen', 'Konten', 'Mail-Vorschläge', 'Claude', 'Datenschutz']
    ok(JSON.stringify(tabs) === JSON.stringify(want), `Reiter-Reihenfolge (${tabs.join(', ')})`)
    ok((await p.locator('.settings-content h3').first().innerText()).trim() === 'Darstellung', 'Einstellungen öffnen auf „Darstellung“')
    await p.locator('[role="radiogroup"][aria-label="Modus"] [role="radio"]:has-text("Dunkel")').click()
    await sleep(200)
    ok((await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'Modus-Karte „Dunkel“ wirkt sofort')
    await p.locator('[role="radiogroup"][aria-label="Modus"] [role="radio"]:has-text("Hell")').click()
    const acc = p.locator('[role="radiogroup"][aria-label="Akzentfarbe"]')
    await acc.locator('[aria-checked="true"]').focus()
    for (let i = 0; i < 3; i++) await p.keyboard.press('ArrowRight')
    await sleep(200)
    ok((await p.evaluate(() => document.documentElement.dataset.accent)) === 'green', 'Pfeiltasten: Indigo → Petrol → Blau → Grün')
    ok((await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())) === '#1d7346', '--accent übernimmt die grüne Akzentfarbe')
    await p.locator('[role="radiogroup"][aria-label="Animationen"] [role="radio"]:has-text("Reduziert")').click()
    await sleep(150)
    ok((await p.evaluate(() => document.documentElement.dataset.motion)) === 'reduced', 'Animationen „Reduziert“ wirkt sofort')
    await p.keyboard.press('Escape')
    await sleep(300)
    await p.keyboard.press('Control+k')
    await sleep(300)
    await p.keyboard.type('Akzent: Rose')
    await sleep(200)
    await p.keyboard.press('Enter')
    await sleep(300)
    ok((await p.evaluate(() => document.documentElement.dataset.accent)) === 'rose', 'Befehlspalette „Akzent: Rose“')
    await p.reload()
    await p.waitForSelector('.app')
    await sleep(800)
    ok((await p.evaluate(() => document.documentElement.dataset.accent)) === 'rose', 'Akzent bleibt nach Neustart erhalten')
    await p.context().close()
  },

  async dialog(b, url) {
    const p = await start(b, url)
    const opener = p.locator('.view-header button:has-text("Aufgabe")')
    await opener.click()
    await p.waitForSelector('.dialog')
    ok((await p.evaluate(() => getComputedStyle(document.querySelector('.overlay')).backdropFilter)) !== 'none', 'Unschärfe hinter dem Dialog')
    for (let i = 0; i < 25; i++) await p.keyboard.press('Tab')
    ok(await p.evaluate(() => !!document.activeElement?.closest('.dialog')), 'Tab bleibt im Dialog')
    await p.keyboard.press('Escape')
    await sleep(250)
    ok(await p.locator('.dialog').count() === 0, 'Esc schließt den unveränderten Dialog sofort')
    ok(await opener.evaluate((el) => el === document.activeElement), 'Fokus zurück auf „Aufgabe“')
    await opener.click()
    await p.waitForSelector('.dialog')
    await p.keyboard.type('Entwurf, der nicht verloren gehen soll')
    await p.keyboard.press('Escape')
    await sleep(250)
    ok(await p.locator('.dialog').count() === 1, 'Mit Eingaben: Esc schließt nicht sofort')
    ok(await p.locator('.dialog-confirm').isVisible(), 'Rückfrage „Änderungen verwerfen?“ erscheint')
    await p.locator('.dialog-confirm button:has-text("Weiter bearbeiten")').click()
    ok(await p.locator('.dialog').count() === 1 && (await p.locator('.dialog-confirm').count()) === 0, 'Weiter bearbeiten behält den Dialog')
    await p.keyboard.press('Escape')
    await p.locator('.dialog-confirm button:has-text("Verwerfen")').click()
    await sleep(250)
    ok(await p.locator('.dialog').count() === 0, 'Verwerfen schließt den Dialog')
    await p.context().close()
  },

  async focus(b, url) {
    const p = await start(b, url)
    const launch = p.locator('.focus-launch')
    ok((await launch.evaluate((el) => getComputedStyle(el).backgroundImage)) === 'none', 'Fokus-Knopf ohne Farbverlauf')
    await p.keyboard.press('Control+Shift+F')
    await p.waitForSelector('.focus-setup')
    await p.locator('[role="combobox"][aria-label="Aufgabe"]').click()
    await p.keyboard.type('Wochen')
    await p.keyboard.press('Enter')
    await sleep(200)
    ok((await p.locator('[role="combobox"][aria-label="Aufgabe"]').innerText()).includes('Wochenbericht'), 'Aufgabe per Suche gewählt')
    const dur = p.locator('[role="radiogroup"][aria-label="Dauer"]')
    ok(await dur.count() === 1, 'Dauer als Auswahlgruppe')
    await dur.locator('[role="radio"]:has-text("60")').click()
    await p.keyboard.press('ArrowRight')
    ok((await dur.locator('[aria-checked="true"]').innerText()).includes('90'), 'Pfeiltaste wechselt die Dauer (60 → 90)')
    await p.mouse.click(640, 30)
    await p.keyboard.press('Enter')
    await sleep(500)
    ok(await p.locator('.focus-setup').count() === 0, 'Enter startet den Fokus')
    ok(/Wochenbericht/.test(await p.locator('.focus-view').innerText()), 'mit der gewählten Aufgabe')
    await p.context().close()
  },

  async keysStayLocal(b, url) {
    const p = await start(b, url)
    await p.keyboard.press('Control+2')
    await p.waitForSelector('.cal-toolbar')
    const range = () => p.locator('.cal-toolbar .range').innerText()
    const before = await range()
    await p.locator('[role="radiogroup"] [role="radio"][aria-checked="true"]').first().focus()
    await p.keyboard.press('ArrowRight')
    await sleep(300)
    const after = await range()
    const month = before.match(/(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)/)?.[1]
    ok(!!month && after.includes(month), `→ auf dem Umschalter wechselt nur die Ansicht, blättert nicht (${before} → ${after})`)
    await p.context().close()
  },

  async settingsLayout(b, url) {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 900, height: 640 }]) {
      const p = await start(b, url, { viewport })
      await p.keyboard.press('Control+,')
      await p.waitForSelector('.settings-nav')
      const problems = []
      for (const tab of await p.locator('.settings-nav button').all()) {
        const name = (await tab.innerText()).trim()
        await tab.click()
        await sleep(350)
        const found = await p.evaluate(() => {
          const out = []
          for (const row of document.querySelectorAll('.settings-content .setting')) {
            const label = row.querySelector(':scope > .label')
            const control = row.querySelector(':scope > .control')
            const title = label?.querySelector('b')?.textContent?.trim() ?? '?'
            const r = row.getBoundingClientRect()
            if (r.width === 0) continue
            for (const el of row.querySelectorAll('.label b, .label span, .control *')) {
              if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible' && !el.closest('.select-btn')) out.push(`${title}: abgeschnitten (${el.className || el.tagName})`)
            }
            if (label && control) {
              const a = label.getBoundingClientRect(), c = control.getBoundingClientRect()
              const side = a.right <= c.left + 1
              const below = c.top >= a.bottom - 1
              if (!side && !below) out.push(`${title}: Beschriftung und Bedienelement überlagern sich`)
              if (c.right > r.right + 1) out.push(`${title}: Bedienelement ragt rechts hinaus`)
              const lh = parseFloat(getComputedStyle(label.querySelector('b')).lineHeight) || 20
              if (label.querySelector('b').getBoundingClientRect().height > lh * 2.2) out.push(`${title}: Überschrift bricht mehrfach um`)
            }
          }
          return out
        })
        problems.push(...found.map((f) => `[${viewport.width}px · ${name}] ${f}`))
      }
      ok(problems.length === 0, `Einstellungen bei ${viewport.width}×${viewport.height} sauber ausgerichtet${problems.length ? ':\n      ' + problems.slice(0, 8).join('\n      ') : ''}`)
      if (viewport.width === 1280) {
        await p.locator('.settings-nav button:has-text("Mail-Vorschläge")').click()
        await sleep(300)
        const rule = await p.evaluate(() => {
          const b = [...document.querySelectorAll('.settings-content .setting .label b')].find((x) => x.textContent.includes('Regeln'))
          return b ? b.getBoundingClientRect().height : -1
        })
        ok(rule > 0 && rule < 26, `„Regeln → Projekt“ steht in einer Zeile (${Math.round(rule)} px hoch)`)
        // Schalter: Ruhe-, Hover-, Fokus- und deaktivierter Zustand unterscheidbar
        await p.locator('.settings-nav button:has-text("Benachrichtigungen")').click()
        await sleep(300)
        const sw = p.locator('.settings-content .switch:not(:disabled)').first()
        const look = () => sw.evaluate((el) => { const c = getComputedStyle(el); return `${c.backgroundColor}|${c.boxShadow}` })
        const rest = await look()
        await sw.hover()
        await sleep(250)
        const hover = await look()
        ok(rest !== hover, 'Schalter: Hover sichtbar')
        await p.mouse.move(5, 5)
        await sw.focus()
        await p.keyboard.press('Shift+Tab')
        await p.keyboard.press('Tab')
        await sleep(250)
        const focusRing = await sw.evaluate((el) => getComputedStyle(el).boxShadow)
        ok(focusRing !== 'none' && focusRing !== rest.split('|')[1], 'Schalter: Tastaturfokus sichtbar')
        await p.locator('.switch[aria-label="Vor Terminen erinnern"]').click()
        await sleep(300)
        const dis = await p.evaluate(() => { const d = document.querySelector('.settings-content .switch:disabled'); return d ? Number(getComputedStyle(d).opacity) : -1 })
        ok(dis > 0 && dis < 0.7, `Schalter: deaktiviert erkennbar (Deckkraft ${dis})`)
        await p.locator('.switch[aria-label="Vor Terminen erinnern"]').click()
      }
      await p.context().close()
    }
  },

  async sidebarAuto(b, url) {
    const p = await start(b, url)
    await p.keyboard.press('Control+1')
    const geo = () => p.evaluate(() => {
      const sb = document.querySelector('.sidebar').getBoundingClientRect()
      const main = document.querySelector('.main').getBoundingClientRect()
      return { sb: Math.round(sb.width), sbRight: Math.round(sb.right), mainLeft: Math.round(main.left), labels: getComputedStyle(document.querySelector('.sidebar .nav-item .label')).opacity }
    })
    ok(await p.locator('.sb-toggle').count() === 0, 'kein Öffnen/Schließen-Knopf')
    await p.mouse.move(700, 400)
    await sleep(700)
    const rail = await geo()
    ok(rail.sb <= 64 && rail.mainLeft <= 90, `eingeklappt am Rand (${rail.sb} px breit, Inhalt ab ${rail.mainLeft} px)`)
    // Ausfahren: während der Animation nie Überlappung, danach volle Breite
    await p.mouse.move(30, 300)
    const frames = []
    for (let i = 0; i < 12; i++) {
      frames.push(await geo())
      await sleep(35)
    }
    await sleep(300)
    const open = await geo()
    ok(open.sb >= 200, `fährt beim Überfahren aus (${open.sb} px)`)
    ok(frames.every((f) => f.mainLeft >= f.sbRight), 'Inhalt rückt synchron mit – nie überlappt')
    ok(open.mainLeft - open.sbRight <= 12 && open.mainLeft > rail.mainLeft + 120, `Inhalt rückt nach rechts (${rail.mainLeft} → ${open.mainLeft} px)`)
    ok(Number(open.labels) > 0.9, 'Beschriftungen sichtbar')
    // Bewegen innerhalb der Leiste: bleibt offen, kein Flackern
    let closedWhileInside = false
    for (const x of [40, 90, 140, 180, 120, 60, 20]) {
      await p.mouse.move(x, 250 + x)
      await sleep(60)
      if ((await geo()).sb < 200) closedWhileInside = true
    }
    ok(!closedWhileInside, 'bleibt beim Bewegen innerhalb der Leiste offen')
    // Verlassen: fährt wieder ein, Inhalt gleitet zurück
    await p.mouse.move(800, 400)
    await sleep(900)
    const back = await geo()
    ok(back.sb <= 64 && back.mainLeft <= 90, `fährt nach dem Verlassen wieder ein (${back.sb} px)`)
    // Nach einem Klick auf einen Eintrag fährt sie trotzdem wieder ein (Fokus hält sie nicht fest)
    await p.mouse.move(30, 300)
    await sleep(400)
    await p.locator('.sidebar .nav-item:has-text("Kalender")').click()
    await p.mouse.move(800, 400)
    await sleep(900)
    ok((await geo()).sb <= 64, 'nach Klick auf „Kalender“ und Wegbewegen wieder eingefahren')
    // Ganz am Fensterrand (Abstand links) reicht zum Ausfahren
    await p.mouse.move(2, 400)
    await sleep(500)
    ok((await geo()).sb >= 200, 'Fensterrand links öffnet die Leiste')
    await p.mouse.move(800, 400)
    await sleep(900)
    // Strg+B heftet an
    await p.keyboard.press('Control+b')
    await sleep(600)
    await p.mouse.move(900, 300)
    await sleep(800)
    ok((await geo()).sb >= 200, 'Strg+B: dauerhaft ausgeklappt')
    await p.keyboard.press('Control+b')
    await sleep(800)
    ok((await geo()).sb <= 64, 'Strg+B erneut: wieder automatisch')
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
