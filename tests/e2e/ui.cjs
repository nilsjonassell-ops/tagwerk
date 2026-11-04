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
  await p.waitForSelector('.capture-bar')
}

const tests = {
  async menu(b, url) {
    const p = await start(b, url)
    await openFirstMail(p)
    const trigger = p.locator('button[aria-label="Weitere Aktionen"]')
    await trigger.click()
    // Kein Aufblitzen oben links: sichtbar erst an der richtigen Stelle
    const early = await p.evaluate(() => {
      const m = document.querySelector('#layer-root [role="menu"]')
      if (!m) return 'fehlt'
      const r = m.getBoundingClientRect()
      return getComputedStyle(m).visibility === 'hidden' || r.left > 100 ? 'ok' : `bei ${Math.round(r.left)},${Math.round(r.top)}`
    })
    ok(early === 'ok', `Menü erscheint gleich an seinem Platz (${early})`)
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
    await p.locator('[role="menuitem"]:has-text("Zur Bearbeitung")').click()
    await sleep(400)
    ok(await p.locator('[role="menu"]').count() === 0 && (await p.locator('.toast, .tag').count()) >= 0, 'Menüeintrag während der Seitenleisten-Animation klickbar')
    await trigger.click()
    await sleep(200)
    ok((await p.locator('[role="menuitem"]').first().innerText()).includes('Nicht mehr zur Bearbeitung'), 'Eintrag wurde ausgeführt (jetzt „Nicht mehr zur Bearbeitung“)')
    await p.keyboard.press('Escape')
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

  async capture(b, url) {
    const p = await start(b, url)
    await openFirstMail(p)
    const bar = await p.locator('.reader-toolbar').evaluate((el) => el.getBoundingClientRect().height)
    ok(bar < 44, `Mail-Werkzeugleiste in einer Zeile (${Math.round(bar)} px)`)
    ok(await p.locator('.capture-bar .capture-btn').count() === 3, 'drei Wege: Aufgabe, Notiz, Termin')
    await p.locator('.capture-btn.k-task').click()
    await p.waitForSelector('.capture-head')
    ok((await p.locator('.dialog h2').innerText()).includes('Aus E-Mail übernehmen'), 'Dialog „Aus E-Mail übernehmen“')
    ok(await p.locator('.capture-steps [aria-current="step"]').innerText().then((t) => t.includes('Prüfen')), 'Schritt 2 „Prüfen & ergänzen“ ist aktiv')
    ok((await p.locator('.capture-kind[aria-checked="true"]').innerText()).includes('Aufgabe'), 'Art „Aufgabe“ gewählt')
    ok(await p.locator('.field .origin-tag').count() >= 1, 'Herkunft der Angaben gekennzeichnet')
    ok(await p.locator('.capture-summary').count() === 1, 'Zusammenfassung: übernommen / prüfen / fehlt')
    const title = p.locator('.dialog input.input').first()
    await title.fill('Freigabe Startseite bestätigen (Test)')
    await p.locator('.capture-kind.k-event').click()
    await sleep(300)
    ok((await p.locator('.dialog .dialog-foot .btn.primary').innerText()).includes('Termin'), 'Wechsel zu „Termin“')
    await p.locator('.capture-kind.k-task').click()
    await sleep(300)
    ok((await p.locator('.dialog input.input').first().inputValue()) === 'Freigabe Startseite bestätigen (Test)', 'Zurück zu „Aufgabe“: Eingabe ist erhalten')
    // Doppelklick legt nur einmal an
    await p.locator('.dialog .dialog-foot .btn.primary').dblclick()
    await sleep(400)
    ok(await p.locator('.dialog').count() === 0, 'Dialog nach dem Speichern geschlossen')
    const toast = p.locator('.toast:has-text("angelegt")')
    ok(await toast.count() === 1, 'Bestätigung „angelegt“')
    ok(await toast.locator('button:has-text("Öffnen")').count() === 1, 'mit direktem Weg „Öffnen“')
    // Doppelte: Hinweis beim nächsten Mal
    ok(await p.locator('.capture-btn.k-task .cb-done').count() === 1, 'Knopf zeigt: schon angelegt')
    await p.locator('.capture-btn.k-task').click()
    await p.waitForSelector('.capture-head')
    ok(await p.locator('.capture-dup').count() === 1, 'Hinweis: aus dieser Mail gibt es schon eine Aufgabe')
    await p.keyboard.press('Escape')
    await sleep(300)
    if (await p.locator('.dialog-confirm').count()) await p.locator('.dialog-confirm button:has-text("Verwerfen")').click()
    await sleep(200)
    await toast.locator('button:has-text("Öffnen")').click().catch(() => {})
    await sleep(500)
    const opened = await p.evaluate(() => document.querySelector('.dialog h2')?.textContent ?? '')
    ok(/Aufgabe bearbeiten/.test(opened), `„Öffnen“ führt zur angelegten Aufgabe (${opened})`)
    await p.keyboard.press('Escape')
    await sleep(300)
    await p.keyboard.press('Control+4')
    await sleep(500)
    await p.locator('[role="radiogroup"][aria-label="Ansicht"] [role="radio"]:has-text("Alle")').click()
    await sleep(300)
    const titles = await p.locator('.task-row:has-text("Freigabe Startseite bestätigen (Test)")').allInnerTexts()
    const nTasks = titles.filter((t) => t.split('\n')[0].trim() === 'Freigabe Startseite bestätigen (Test)').length
    ok(nTasks === 1, `genau eine Aufgabe angelegt (kein Doppel durch Doppelklick) – gefunden: ${nTasks}`)
    // Notiz
    await openFirstMail(p)
    await p.locator('.capture-btn.k-note').click()
    await p.waitForSelector('.capture-head')
    ok((await p.locator('.capture-kind[aria-checked="true"]').innerText()).includes('Notiz'), 'Notiz: Art gewählt')
    await p.locator('.dialog .dialog-foot .btn.primary').click()
    await sleep(400)
    await p.locator('.toast:has-text("Notiz") button:has-text("Öffnen")').click()
    await sleep(500)
    ok((await p.evaluate(() => document.querySelector('.main')?.querySelector('.view-title')?.textContent ?? '')).includes('Notizen'), 'Notiz „Öffnen“ führt zu Notizen')
    ok(p.errors.length === 0, `keine Konsolenfehler (${p.errors.join(' | ')})`)
    await p.context().close()
  },

  async doubleSubmit(b, url) {
    const p = await start(b, url)
    // Simuliertes Outlook verbinden: Anlegen dauert dort wie im echten Netz einen Moment
    await p.keyboard.press('Control+,')
    await p.waitForSelector('.settings-nav')
    await p.locator('.settings-nav button:has-text("Konten")').click()
    await p.locator('button:has-text("Mit Microsoft anmelden")').click()
    await sleep(1500)
    await p.keyboard.press('Escape')
    await sleep(300)
    await openFirstMail(p)
    await p.locator('.capture-btn.k-event').click()
    await p.waitForSelector('.capture-head')
    ok((await p.locator('[role="combobox"][aria-label="Kalender"]').innerText()).includes('Outlook'), 'Ziel: Outlook-Kalender (simuliert)')
    await p.locator('.dialog input.input').first().fill('Doppelklick-Test')
    const save = p.locator('.dialog .dialog-foot .btn.primary')
    await save.dblclick()
    await sleep(120)
    const during = (await save.count()) ? await save.evaluate((el) => `${el.disabled}|${el.textContent}`) : 'zu'
    ok(during.startsWith('true') && during.includes('Speichert'), `während des Speicherns gesperrt mit „Speichert …“ (${during})`)
    await sleep(1500)
    ok(await p.locator('.dialog').count() === 0, 'Dialog nach dem Speichern geschlossen')
    await p.keyboard.press('Control+2')
    await sleep(800)
    const n = await p.locator('.cal-event:has-text("Doppelklick-Test")').count()
    ok(n === 1, `Doppelklick legt genau einen Termin an (gefunden: ${n})`)
    await p.context().close()
  },

  async accounts(b, url) {
    for (const scheme of ['light', 'dark']) {
      const p = await start(b, url, { scheme })
      await p.keyboard.press('Control+,')
      await p.waitForSelector('.settings-nav')
      await p.locator('.settings-nav button:has-text("Konten")').click()
      await p.waitForSelector('.provider-list')
      await sleep(500) // Dialog fertig eingeblendet
      const groups = await p.locator('.providers section').evaluateAll((s) => s.map((x) => x.getAttribute('aria-label')))
      if (scheme === 'light') ok(JSON.stringify(groups) === JSON.stringify(['E-Mail', 'Kalender', 'Notizen & Sicherung']), `Gruppen (${groups.join(', ')})`)
      const state = (id) => p.locator(`[data-provider="${id}"] .pr-state`).innerText()
      if (scheme === 'light') {
        ok((await state('gmail')).includes('Nicht verbunden'), 'Gmail: „Nicht verbunden“ als Text')
        ok((await state('icloud-mail')).includes('Nicht unterstützt'), 'iCloud Mail: ehrlich „Nicht unterstützt“, ohne Knopf')
        ok(await p.locator('[data-provider="icloud-mail"] button').count() === 0, 'nicht unterstützt → keine Aktion')
      }
      // Logos: gleiche Kachel, Inhalt mittig, Name auf gleicher Höhe wie Logo-Mitte
      const geo = await p.evaluate(() =>
        [...document.querySelectorAll('.provider-row')].map((r) => {
          const l = r.querySelector('.provider-logo').getBoundingClientRect()
          const t = r.querySelector('.pr-text').getBoundingClientRect()
          const g = r.querySelector('.provider-logo svg').getBoundingClientRect()
          return { w: Math.round(l.width), h: Math.round(l.height), dy: Math.abs(l.top + l.height / 2 - (t.top + t.height / 2)), gx: Math.abs(g.left + g.width / 2 - (l.left + l.width / 2)), gy: Math.abs(g.top + g.height / 2 - (l.top + l.height / 2)) }
        })
      )
      ok(geo.every((x) => x.w === 36 && x.h === 36), `[${scheme}] alle Logos gleich groß (36 px) ${geo.filter((x) => x.w !== 36 || x.h !== 36).map((x) => x.w + '×' + x.h).join(' ')}`)
      ok(geo.every((x) => x.gx < 1.5 && x.gy < 1.5), `[${scheme}] Logos mittig in der Kachel`)
      ok(geo.every((x) => x.dy < 3), `[${scheme}] Name und Logo auf einer Höhe`)
      if (scheme === 'light') {
        // Aktion springt zum Abschnitt
        await p.locator('[data-provider="apple-calendar"] button').click()
        await sleep(700)
        const vis = await p.evaluate(() => { const r = document.getElementById('acc-apple').getBoundingClientRect(); const c = document.querySelector('.settings-content').getBoundingClientRect(); return r.top >= c.top - 2 && r.top < c.bottom - 40 })
        ok(vis, '„Verbinden“ bei Apple führt zum Abschnitt Apple Kalender')
        // Simuliertes Microsoft verbinden → Zustände wechseln
        await p.locator('button:has-text("Mit Microsoft anmelden")').click()
        await sleep(1600)
        ok((await state('outlook-mail')).includes('Verbunden'), 'nach der Anmeldung: Outlook „Verbunden“')
        ok((await state('outlook-calendar')).includes('Verbunden') || (await state('outlook-calendar')).includes('abgeglichen'), 'Outlook-Kalender verbunden')
        ok((await p.locator('[data-provider="outlook-mail"] button').innerText()).includes('Verwalten'), 'Aktion wird zu „Verwalten“')
      }
      ok(p.errors.length === 0, `[${scheme}] keine Konsolenfehler (${p.errors.join(' | ')})`)
      await p.context().close()
    }
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
