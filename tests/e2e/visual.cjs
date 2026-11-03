// Bildvergleich der Hauptansichten (nur lokal – Schriftdarstellung weicht je Rechner ab):
//   npm run build:web && npm run test:visual            → vergleicht mit tests/visual/baseline
//   npm run test:visual -- --update                      → setzt den aktuellen Stand als Vergleich
// Ansichten: Heute, Kalender, Posteingang, Einstellungen, Fokus × Hell / Dunkel / reduzierte Bewegung.
const { chromium } = require('playwright')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '../../out/web')
const DIR = path.join(__dirname, '../visual')
const BASE = path.join(DIR, 'baseline')
const CUR = path.join(DIR, 'current')
const UPDATE = process.argv.includes('--update')
/** Erlaubter Anteil abweichender Pixel (Jetzt-Linie, Uhrzeit) */
const TOLERANCE = 0.004
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname))
      if (!f.startsWith(ROOT)) return res.writeHead(403).end()
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, 'index.html')
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' })
      fs.createReadStream(f).pipe(res)
    })
    srv.listen(0, '127.0.0.1', () => resolve(srv))
  })
}

const VIEWS = [
  ['heute', async (p) => p.keyboard.press('Control+1')],
  ['kalender', async (p) => p.keyboard.press('Control+2')],
  ['posteingang', async (p) => p.keyboard.press('Control+3')],
  ['einstellungen', async (p) => p.keyboard.press('Control+,')],
  ['fokus', async (p) => p.keyboard.press('Control+Shift+F')]
]
const MODES = [
  ['hell', { colorScheme: 'light' }],
  ['dunkel', { colorScheme: 'dark' }],
  ['reduziert', { colorScheme: 'light', reducedMotion: 'reduce' }]
]

/** Anteil abweichender Pixel – im Browser über Canvas berechnet */
async function diff(page, a, b) {
  return page.evaluate(
    async ([a, b]) => {
      const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src })
      const [x, y] = await Promise.all([load(a), load(b)])
      if (x.width !== y.width || x.height !== y.height) return 1
      const c = new OffscreenCanvas(x.width, x.height).getContext('2d')
      c.drawImage(x, 0, 0)
      const p = c.getImageData(0, 0, x.width, x.height).data
      c.clearRect(0, 0, x.width, x.height)
      c.drawImage(y, 0, 0)
      const q = c.getImageData(0, 0, x.width, x.height).data
      let n = 0
      for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 48) n++
      return n / (p.length / 4)
    },
    [a, b]
  )
}

;(async () => {
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
    console.error('out/web fehlt – zuerst npm run build:web')
    process.exit(2)
  }
  fs.mkdirSync(CUR, { recursive: true })
  fs.mkdirSync(BASE, { recursive: true })
  const srv = await serve()
  const url = `http://127.0.0.1:${srv.address().port}/`
  const b = await chromium.launch()
  const shots = []
  for (const [mode, opts] of MODES) {
    const ctx = await b.newContext({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 1, ...opts })
    const p = await ctx.newPage()
    await p.goto(url)
    await p.waitForSelector('.app')
    await sleep(2500)
    const go = p.locator('button:has-text("Loslegen")')
    if (await go.count()) await go.first().click()
    for (const [name, open] of VIEWS) {
      await p.keyboard.press('Escape')
      await sleep(200)
      await open(p)
      await sleep(900)
      const file = `${name}-${mode}.png`
      await p.screenshot({ path: path.join(CUR, file) })
      shots.push(file)
    }
    await ctx.close()
  }
  let fails = 0
  const page = await b.newPage()
  for (const f of shots) {
    const base = path.join(BASE, f)
    if (UPDATE || !fs.existsSync(base)) {
      fs.copyFileSync(path.join(CUR, f), base)
      console.log(`NEU  ${f}`)
      continue
    }
    const d = await diff(page, `data:image/png;base64,${fs.readFileSync(base).toString('base64')}`, `data:image/png;base64,${fs.readFileSync(path.join(CUR, f)).toString('base64')}`)
    const bad = d > TOLERANCE
    if (bad) fails++
    console.log(`${bad ? 'ANDERS' : 'OK    '} ${f}  (${(d * 100).toFixed(2)} % abweichend)`)
  }
  await b.close()
  srv.close()
  console.log(fails ? `${fails} Ansichten abweichend – Bilder in tests/visual/current prüfen, mit --update übernehmen` : 'alle Ansichten wie im Vergleich')
  process.exit(fails ? 1 : 0)
})()
