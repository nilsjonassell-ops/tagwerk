import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyAdd, categorize, editItem, mergeItems, newItem, planAdd, purgeTombstones, quickItem, removeOrigins, visibleItems } from '../src/shared/shopping.ts'
import { parseIngredient } from '../src/shared/ingredients.ts'
import type { ShoppingItem } from '../src/shared/types.ts'

const T0 = 1_700_000_000_000
const L = 'list-1'
const pick = (raw: string, key: string, label = 'Spaghetti') => ({ ingredient: parseIngredient(raw, key), originKey: key, label })

test('Kategorie nach Lebensmittelbereich', () => {
  assert.equal(categorize('frische Tomaten'), 'produce')
  assert.equal(categorize('Vollmilch'), 'dairy')
  assert.equal(categorize('Parmesankäse'), 'dairy')
  assert.equal(categorize('Spaghetti'), 'pantry')
  assert.equal(categorize('Hähnchenbrust'), 'meat')
  assert.equal(categorize('Oregano'), 'spices')
  assert.equal(categorize('Spülmittel'), 'household')
  assert.equal(categorize('Geschenkpapier'), 'other')
})

test('Schnelleingabe: „500 g Nudeln“ und „Milch“', () => {
  const a = quickItem(L, '500 g Nudeln', 'Nils', T0)
  assert.deepEqual([a.qty, a.unit, a.name, a.category, a.done], [500, 'g', 'Nudeln', 'pantry', false])
  const b = quickItem(L, 'Milch', 'Nils', T0)
  assert.deepEqual([b.qty, b.name, b.category], [undefined, 'Milch', 'dairy'])
  assert.ok(b.stamps.name && b.stamps.done !== undefined)
})

test('Hinzufügen: gleiche Zutat + vergleichbare Einheit wird zusammengefasst (g + kg)', () => {
  const items: ShoppingItem[] = [{ ...quickItem(L, '200 g Mehl', 'Nils', T0) }]
  const plan = planAdd(items, L, [pick('1 kg Mehl', 'r1:0')])
  assert.equal(plan[0].action, 'merge')
  const next = applyAdd(items, L, plan, 'Nils', T0 + 1)
  const mehl = visibleItems(next).filter((i) => i.name === 'Mehl')
  assert.equal(mehl.length, 1)
  assert.deepEqual([mehl[0].qty, mehl[0].unit], [1200, 'g'])
  assert.equal(mehl[0].origins?.length, 1)
})

test('Hinzufügen: Singular/Plural gilt als gleiche Zutat (Zwiebel/Zwiebeln)', () => {
  const items = [quickItem(L, '1 Zwiebel', 'Nils', T0)]
  const plan = planAdd(items, L, [pick('2 Zwiebeln', 'r1:1')])
  assert.equal(plan[0].action, 'merge')
  const z = visibleItems(applyAdd(items, L, plan, 'Nils', T0 + 1)).find((i) => /Zwiebel/.test(i.name))
  assert.equal(z?.qty, 3)
})

test('Hinzufügen: unvergleichbare Einheiten bleiben getrennt (Dose vs. g, EL vs. ml)', () => {
  const items = [quickItem(L, '400 g Tomaten', 'Nils', T0), quickItem(L, '100 ml Olivenöl', 'Nils', T0)]
  const plan = planAdd(items, L, [pick('1 Dose Tomaten', 'r1:2'), pick('2 EL Olivenöl', 'r1:3')])
  assert.deepEqual(
    plan.map((p) => p.action),
    ['separate', 'separate']
  )
  assert.match(plan[0].reason ?? '', /Einheit/)
  const next = visibleItems(applyAdd(items, L, plan, 'Nils', T0 + 1))
  assert.equal(next.filter((i) => i.name === 'Tomaten').length, 2)
})

test('Hinzufügen: EL und TL sind umrechenbar', () => {
  const items = [quickItem(L, '1 EL Zucker', 'Nils', T0)]
  const plan = planAdd(items, L, [pick('3 TL Zucker', 'r1:4')])
  assert.equal(plan[0].action, 'merge')
  const z = visibleItems(applyAdd(items, L, plan, 'Nils', T0 + 1))[0]
  assert.deepEqual([z.qty, z.unit], [2, 'EL'])
})

test('Hinzufügen: Spannen werden nicht zusammengerechnet (uneindeutig)', () => {
  const items = [quickItem(L, '2 Knoblauchzehen', 'Nils', T0)]
  const plan = planAdd(items, L, [pick('1-3 Knoblauchzehen', 'r1:5')])
  assert.equal(plan[0].action, 'separate')
})

test('Hinzufügen: Zutaten ohne Menge (Salz) nur einmal auf der Liste', () => {
  const items = [quickItem(L, 'Salz', 'Nils', T0)]
  const plan = planAdd(items, L, [pick('Salz', 'r1:6')])
  assert.equal(plan[0].action, 'present')
  assert.equal(visibleItems(applyAdd(items, L, plan, 'Nils', T0 + 1)).length, 1)
})

test('Gleiches Rezept zweimal hinzufügen: keine doppelten Mengen', () => {
  let items: ShoppingItem[] = []
  const picks = [pick('500 g Spaghetti', 'r1:0'), pick('1 Zwiebel', 'r1:1')]
  items = applyAdd(items, L, planAdd(items, L, picks), 'Nils', T0)
  const again = planAdd(items, L, picks)
  assert.deepEqual(
    again.map((p) => p.action),
    ['duplicate', 'duplicate']
  )
  items = applyAdd(items, L, again, 'Nils', T0 + 1)
  const sp = visibleItems(items).find((i) => i.name === 'Spaghetti')
  assert.equal(sp?.qty, 500)
})

test('Bereits gekaufte Einträge werden nicht erweitert – neuer Eintrag', () => {
  const bought = { ...quickItem(L, '500 g Spaghetti', 'Nils', T0), done: true }
  const plan = planAdd([bought], L, [pick('500 g Spaghetti', 'r2:0')])
  assert.equal(plan[0].action, 'new')
})

test('Zurücknehmen (Gericht gelöscht): Menge abziehen, Eintrag entfernen, Bearbeitetes bleibt', () => {
  let items: ShoppingItem[] = [quickItem(L, '200 g Mehl', 'Nils', T0)]
  items = applyAdd(items, L, planAdd(items, L, [pick('300 g Mehl', 'meal:m1:0', 'Pfannkuchen'), pick('2 Eier', 'meal:m1:1', 'Pfannkuchen'), pick('1 l Milch', 'meal:m1:2', 'Pfannkuchen')]), 'Nils', T0 + 1)
  const milk = visibleItems(items).find((i) => i.name === 'Milch')!
  items = items.map((i) => (i.id === milk.id ? editItem(i, { qty: 2, unit: 'l' }, 'Nils', T0 + 2) : i))
  const r = removeOrigins(items, 'meal:m1:', 'Nils', T0 + 3)
  const vis = visibleItems(r.items)
  assert.equal(vis.find((i) => i.name === 'Mehl')?.qty, 200, 'eigener Anteil bleibt')
  assert.equal(vis.find((i) => i.name === 'Eier'), undefined, 'nur vom Gericht → entfernt')
  assert.equal(vis.find((i) => i.name === 'Milch')?.qty, 2, 'von Hand geändert → bleibt')
  assert.deepEqual(r.kept.map((i) => i.name), ['Milch'])
  assert.equal(r.changed, 2)
})

test('Zurücknehmen lässt Gekauftes in Ruhe', () => {
  let items = applyAdd([], L, planAdd([], L, [pick('2 Eier', 'meal:m2:0')]), 'Nils', T0)
  items = items.map((i) => editItem(i, { done: true }, 'Nils', T0 + 1))
  const r = removeOrigins(items, 'meal:m2:', 'Nils', T0 + 2)
  assert.equal(visibleItems(r.items).length, 1)
  assert.equal(r.changed, 0)
})

test('Zusammenführen: verschiedene Felder gleichzeitig geändert – beides bleibt', () => {
  const base = quickItem(L, '1 l Milch', 'Nils', T0)
  const mine = editItem(base, { done: true }, 'Nils', T0 + 10)
  const theirs = editItem(base, { qty: 2 }, 'Anna', T0 + 12)
  const r = mergeItems([mine], [theirs])
  assert.equal(r.items[0].done, true)
  assert.equal(r.items[0].qty, 2)
  assert.equal(r.conflicts.length, 0)
})

test('Zusammenführen: gleiches Feld – neuere Änderung gewinnt und wird gemeldet', () => {
  const base = quickItem(L, '1 l Milch', 'Nils', T0)
  const mine = editItem(base, { qty: 3 }, 'Nils', T0 + 10)
  const theirs = editItem(base, { qty: 2 }, 'Anna', T0 + 20)
  const r = mergeItems([mine], [theirs])
  assert.equal(r.items[0].qty, 2)
  assert.equal(r.conflicts.length, 1)
  assert.deepEqual([r.conflicts[0].field, r.conflicts[0].by], ['amount', 'Anna'])
  // Umgekehrt: meine Änderung ist neuer → bleibt, kein Konflikt für mich zu melden? doch: die andere ging verloren
  const r2 = mergeItems([editItem(base, { qty: 3 }, 'Nils', T0 + 30)], [theirs])
  assert.equal(r2.items[0].qty, 3)
})

test('Zusammenführen: gleiche Zeit → feste Reihenfolge, beide Seiten erhalten dasselbe Ergebnis', () => {
  const base = quickItem(L, 'Brot', 'Nils', T0)
  const a = editItem(base, { note: 'Vollkorn' }, 'Anna', T0 + 5)
  const b = editItem(base, { note: 'Dinkel' }, 'Nils', T0 + 5)
  assert.equal(mergeItems([a], [b]).items[0].note, mergeItems([b], [a]).items[0].note)
})

test('Zusammenführen: Löschen und neue Einträge kommen an', () => {
  const x = quickItem(L, 'Butter', 'Nils', T0)
  const y = quickItem(L, 'Käse', 'Anna', T0 + 1)
  const del = editItem(x, { deleted: true }, 'Anna', T0 + 5)
  const r = mergeItems([x], [del, y])
  assert.deepEqual(visibleItems(r.items).map((i) => i.name), ['Käse'])
  // Wiederherstellen nach Löschen: späteres „deleted:false“ gewinnt
  const back = editItem(del, { deleted: false }, 'Nils', T0 + 9)
  assert.equal(visibleItems(mergeItems([back], [del]).items).length, 1)
})

test('Grabsteine nach 30 Tagen vergessen', () => {
  const x = editItem(quickItem(L, 'Butter', 'Nils', T0), { deleted: true }, 'Nils', T0)
  assert.equal(purgeTombstones([x], T0 + 31 * 86400_000).length, 0)
  assert.equal(purgeTombstones([x], T0 + 2 * 86400_000).length, 1)
})

test('newItem setzt Zeitstempel für alle Felder', () => {
  const i = newItem(L, { name: 'Äpfel', qty: 1, unit: 'kg' }, 'Nils', T0)
  assert.equal(i.category, 'produce')
  for (const f of ['name', 'amount', 'note', 'category', 'done', 'deleted'] as const) assert.equal(i.stamps[f], T0, f)
})
