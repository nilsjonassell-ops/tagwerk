import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeShareUrl, joinCode, parseJoin, runSharedSync, type SharedIo } from '../src/shared/shopping-share.ts'
import { editItem, mergeItems, pendingCount, quickItem, visibleItems } from '../src/shared/shopping.ts'
import type { SharedListDoc, ShoppingItem } from '../src/shared/types.ts'

const T0 = 1_700_000_000_000

/** Simulierte Datei in OneDrive mit ETag – „fremd“ schreibt einmal genau zwischen Lesen und Schreiben dazwischen */
function fakeDrive(initial: SharedListDoc | null, intruder?: (doc: SharedListDoc) => SharedListDoc) {
  let doc = initial
  let etag = 1
  let writes = 0
  let intruded = false
  const io: SharedIo = {
    async read() {
      return doc ? { doc: structuredClone(doc), etag: String(etag) } : null
    },
    async write(next, ifMatch) {
      if (intruder && !intruded && doc) {
        intruded = true
        doc = intruder(structuredClone(doc))
        etag++
      }
      if (ifMatch !== undefined && ifMatch !== String(etag)) return { ok: false, conflict: true }
      doc = structuredClone(next)
      etag++
      writes++
      return { ok: true, etag: String(etag) }
    }
  }
  return { io, get doc() { return doc }, get writes() { return writes } }
}

const docOf = (items: ShoppingItem[], name = 'WG'): SharedListDoc => ({ v: 1, name, items: Object.fromEntries(items.map((i) => [i.id, i])) })

test('Beitrittscode: hin und zurück, Einladungslink wird erkannt, Unsinn abgelehnt', () => {
  const code = joinCode({ driveId: 'abc123', itemId: 'ABC123!45', role: 'owner' })
  assert.match(code, /^TW1-/)
  assert.deepEqual(parseJoin(code), { kind: 'code', driveId: 'abc123', itemId: 'ABC123!45' })
  assert.deepEqual(parseJoin('  https://1drv.ms/u/s!AbCdEf  '), { kind: 'link', url: 'https://1drv.ms/u/s!AbCdEf' })
  assert.equal(parseJoin('https://onedrive.live.com/redir?resid=X')?.kind, 'link')
  assert.equal(parseJoin('hallo'), null)
  assert.equal(parseJoin('https://example.com/phish'), null, 'nur OneDrive-Links')
})

test('Teilen-Link für die Graph-Schnittstelle kodieren (u!base64url)', () => {
  assert.equal(encodeShareUrl('https://1drv.ms/u/s!AbC?x=1'), 'u!' + Buffer.from('https://1drv.ms/u/s!AbC?x=1').toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-'))
})

test('Erster Abgleich legt die Datei an', async () => {
  const d = fakeDrive(null)
  const local = [quickItem('L', 'Milch', 'Nils', T0)]
  const r = await runSharedSync(d.io, local, 'WG', T0 + 1)
  assert.equal(r.ok, true)
  assert.equal(Object.keys(d.doc!.items).length, 1)
  assert.equal(d.doc!.name, 'WG')
})

test('Nichts geändert → nichts geschrieben', async () => {
  const milk = { ...quickItem('L', 'Milch', 'Nils', T0), syncedAt: T0 }
  const d = fakeDrive(docOf([milk]))
  const r = await runSharedSync(d.io, [milk], 'WG', T0 + 1)
  assert.equal(r.ok && r.wrote, false)
  assert.equal(d.writes, 0)
})

test('Gleichzeitig geschrieben (ETag passt nicht): neu lesen, zusammenführen, nichts geht verloren', async () => {
  const milk = { ...quickItem('L', '1 l Milch', 'Nils', T0), syncedAt: T0 }
  const bread = { ...quickItem('L', 'Brot', 'Nils', T0), syncedAt: T0 }
  const start = docOf([milk, bread])
  // Anna hakt Brot ab und fügt Käse hinzu – genau während Nils schreibt
  const d = fakeDrive(start, (doc) => {
    doc.items[bread.id] = editItem(doc.items[bread.id], { done: true }, 'Anna', T0 + 50)
    const cheese = quickItem('L', 'Käse', 'Anna', T0 + 51)
    doc.items[cheese.id] = cheese
    return doc
  })
  // Nils ändert die Milchmenge
  const local = [editItem(milk, { qty: 2 }, 'Nils', T0 + 40), bread]
  const r = await runSharedSync(d.io, local, 'WG', T0 + 60)
  assert.equal(r.ok, true)
  const items = Object.values(d.doc!.items)
  assert.equal(items.find((i) => i.name === 'Milch')?.qty, 2, 'meine Änderung ist drin')
  assert.equal(items.find((i) => i.name === 'Brot')?.done, true, 'Annas Haken ist drin')
  assert.ok(items.some((i) => i.name === 'Käse'), 'Annas neuer Eintrag ist drin')
  if (r.ok) assert.equal(visibleItems(r.value.items).length, 3, 'lokaler Stand = gemeinsamer Stand')
})

test('Datei dauerhaft umkämpft: nach mehreren Versuchen verständlicher Fehler, lokale Änderungen bleiben', async () => {
  const io: SharedIo = {
    read: async () => ({ doc: docOf([]), etag: String(Math.random()) }),
    write: async () => ({ ok: false, conflict: true })
  }
  const local = [quickItem('L', 'Milch', 'Nils', T0)]
  const r = await runSharedSync(io, local, 'WG', T0)
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.error, /gleichzeitig/)
})

test('Beschädigte Datei wird nicht übernommen', async () => {
  const io: SharedIo = { read: async () => ({ doc: { v: 9 } as unknown as SharedListDoc, etag: '1' }), write: async () => ({ ok: true, etag: '2' }) }
  const r = await runSharedSync(io, [], 'WG', T0)
  assert.equal(r.ok, false)
})

test('Ungültige Einträge aus der Datei werden verworfen', async () => {
  const good = quickItem('L', 'Milch', 'Anna', T0)
  const doc = docOf([good])
  ;(doc.items as Record<string, unknown>)['evil'] = { id: 'evil', name: 42 }
  const d = fakeDrive(doc)
  const r = await runSharedSync(d.io, [], 'WG', T0 + 1)
  assert.equal(r.ok && r.value.items.length, 1)
})

test('Nach dem Abgleich gilt alles als abgeglichen – auch Einträge anderer (sonst Dauerschleife)', async () => {
  const anna = quickItem('L', 'Käse', 'Anna', T0) // kommt ohne Abgleich-Stempel aus der Datei
  const d = fakeDrive(docOf([anna]))
  const mine = quickItem('L', 'Milch', 'Nils', T0 + 1)
  const r = await runSharedSync(d.io, [mine], 'WG', T0 + 2)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(pendingCount(r.value.items), 0)
  // Wird danach lokal geändert, ist genau dieser Eintrag wieder „wartend“
  const edited = r.value.items.map((i) => (i.name === 'Milch' ? editItem(i, { done: true }, 'Nils', T0 + 10) : i))
  assert.equal(pendingCount(edited), 1)
})

test('Zusammenführen markiert lokale, noch nicht gesendete Änderungen nicht als abgeglichen', async () => {
  const base = { ...quickItem('L', 'Milch', 'Nils', T0), syncedAt: T0 }
  const local = editItem(base, { qty: 2 }, 'Nils', T0 + 50) // während des Abgleichs geändert
  const fromServer = { ...base }
  const merged = mergeItems([local], [fromServer]).items
  assert.equal(pendingCount(merged), 1)
})
