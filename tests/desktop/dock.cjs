// Desktop-Test (Electron, virtueller Bildschirm): Andocken am Rand und Start auf „Heute“.
//   npm run build && TAGWERK_DOCK_TEST=1 xvfb-run -a -s "-screen 0 1920x1080x24" npx electron tests/desktop/dock.cjs
const { app, BrowserWindow, screen } = require('electron')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
app.setPath('userData', mkdtempSync(join(tmpdir(), 'tagwerk-dock-')))
require(join(__dirname, '../../out/main/index.js'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let fails = 0
const ok = (c, m) => {
  console.log((c ? 'OK   ' : 'FAIL ') + m)
  if (!c) fails++
}
let main
app.on('browser-window-created', async (_e, win) => {
  if (main) return
  main = win
  await new Promise((r) => win.webContents.once('did-finish-load', r))
  await sleep(3500)
  const js = (c) => win.webContents.executeJavaScript(c)
  // Erster Start: Begrüßung im Vollbild → „Demo ansehen“ → „Demo öffnen“
  await js(`[...document.querySelectorAll('.welcome-option')].find((b) => b.textContent.includes('Demo ansehen'))?.click()`).catch(() => {})
  await sleep(500)
  await js(`[...document.querySelectorAll('.welcome button')].find((b) => b.textContent.includes('Demo öffnen'))?.click()`).catch(() => {})
  await sleep(1500)
  ok(await js(`!!document.querySelector('.app') && !document.querySelector('.welcome')`), 'Begrüßung verlassen, App sichtbar')
  const D = globalThis.__tagwerkDock
  ok(!!D, 'Testzugang zum Andocken vorhanden')
  const work = screen.getPrimaryDisplay().workArea
  win.setSize(1200, 800)
  await js(`window.tagwerk.settings.set({ windowDock: true })`)
  // --- links andocken
  D.setCursor({ x: work.x + 600, y: work.y + 300 })
  win.setPosition(work.x + 7, work.y + 60)
  D.check()
  await sleep(400)
  let st = D.state()
  ok(st.edge === 'left' && st.bounds.x === work.x, `links angedockt und bündig (x=${st.bounds.x})`)
  // Maus verlässt das Fenster → fährt nach Verzögerung ein
  D.setCursor({ x: work.x + 1500, y: work.y + 300 })
  await sleep(350)
  ok(!D.state().collapsed, 'kurzes Verlassen: bleibt ausgefahren')
  await sleep(900)
  st = D.state()
  ok(st.collapsed && st.bounds.x === work.x + 68 - 1200, `eingefahren: nur der 68-px-Streifen sichtbar (x=${st.bounds.x})`)
  ok(await js(`document.querySelector('.app').classList.contains('dock-collapsed') && document.querySelector('.sidebar').getBoundingClientRect().width <= 64`), 'Oberfläche zeigt im Streifen die Symbolleiste')
  // Maus an den Bildschirmrand → fährt zügig aus
  const t0 = Date.now()
  D.setCursor({ x: work.x + 1, y: work.y + 400 })
  while (D.state().collapsed && Date.now() - t0 < 1000) await sleep(5)
  const react = Date.now() - t0
  ok(!D.state().collapsed && react <= 160, `reagiert zügig auf den Streifen (${react} ms)`)
  await sleep(400)
  st = D.state()
  ok(st.bounds.x === work.x, `ausgefahren wieder bündig (x=${st.bounds.x})`)
  // Dialog offen → nicht einfahren
  D.setCursor({ x: work.x + 700, y: work.y + 300 })
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true }))`)
  await sleep(300)
  ok(await js(`!!document.querySelector('.dialog')`), 'Einstellungen geöffnet')
  D.setCursor({ x: work.x + 1600, y: work.y + 300 })
  await sleep(1300)
  ok(!D.state().collapsed, 'mit offenem Dialog fährt das Fenster nicht ein')
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(1300)
  ok(D.state().collapsed, 'nach dem Schließen fährt es ein')
  // --- rechts andocken
  D.setCursor({ x: work.x + work.width - 500, y: work.y + 300 })
  await sleep(300)
  win.setPosition(work.x + work.width - 1200 - 5, work.y + 60)
  D.check()
  await sleep(500)
  st = D.state()
  ok(st.edge === 'right' && st.bounds.x === work.x + work.width - 1200, `rechts angedockt und bündig (x=${st.bounds.x})`)
  if (process.env.SHOT) require('node:fs').writeFileSync(process.env.SHOT + '/dock-right.png', (await win.webContents.capturePage()).toPNG())
  ok(await js(`document.querySelector('.app').classList.contains('dock-right') && document.querySelector('.sidebar').getBoundingClientRect().left > window.innerWidth - 300`), 'rechts: Symbolleiste liegt an der rechten Kante')
  D.setCursor({ x: work.x + 100, y: work.y + 300 })
  await sleep(1300)
  st = D.state()
  ok(st.collapsed && st.bounds.x === work.x + work.width - 68, `rechts eingefahren (x=${st.bounds.x})`)
  // --- wegziehen = abdocken
  win.setPosition(work.x + 300, work.y + 60)
  D.check()
  await sleep(400)
  ok(D.state().edge === null && !D.state().collapsed && D.state().bounds.x === work.x + 300, `vom Rand weggezogen: abgedockt und bleibt, wo es losgelassen wurde (x=${D.state().bounds.x})`)
  // Einstellung ausschalten, während es eingefahren ist → kommt zurück auf den Bildschirm
  win.setPosition(work.x + 3, work.y + 60)
  D.check()
  await sleep(300)
  D.setCursor({ x: work.x + 1500, y: work.y + 300 })
  await sleep(1300)
  ok(D.state().collapsed, 'wieder links eingefahren')
  await js(`window.tagwerk.settings.set({ windowDock: false })`)
  await sleep(400)
  ok(D.state().edge === null && D.state().bounds.x === work.x, `Andocken ausgeschaltet: Fenster wieder ganz sichtbar (x=${D.state().bounds.x})`)
  // --- Ausschalten in den Einstellungen
  await js(`window.tagwerk.settings.set({ windowDock: false })`)
  win.setPosition(work.x, work.y + 60)
  D.check()
  await sleep(400)
  ok(D.state().edge === null, 'Einstellung aus: dockt nicht an')
  // --- Wieder öffnen beginnt auf „Heute“
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', ctrlKey: true, bubbles: true }))`)
  await sleep(500)
  ok((await js(`document.querySelector('.view-title')?.textContent`)) === 'Posteingang', 'Posteingang geöffnet')
  win.hide()
  await sleep(300)
  app.emit('activate')
  await sleep(1200)
  ok((await js(`document.querySelector('.view-title')?.textContent`)) === 'Heute', 'wieder geöffnet: beginnt auf „Heute“')
  console.log(fails ? `${fails} fehlgeschlagen` : 'alle bestanden')
  app.exit(fails ? 1 : 0)
})
