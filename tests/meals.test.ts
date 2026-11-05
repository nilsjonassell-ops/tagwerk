import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDays, dayKey, mealFollowUps, mealsOn, syncMealEvent, weekDays, SLOT_LABEL } from '../src/shared/meals.ts'
import { applyAdd, planAdd } from '../src/shared/shopping.ts'
import { parseIngredient } from '../src/shared/ingredients.ts'
import type { CalEvent, Meal } from '../src/shared/types.ts'

const meal = (over: Partial<Meal> = {}): Meal => ({ id: 'm1', date: '2026-11-09', slot: 'dinner', title: 'Spaghetti mit Tomatensoße', servings: 2, createdAt: '2026-11-05T10:00:00.000Z', updatedAt: '2026-11-05T10:00:00.000Z', ...over })

test('Woche beginnt am Montag, Tage als JJJJ-MM-TT (Ortszeit)', () => {
  const w = weekDays('2026-11-05') // Donnerstag
  assert.equal(w.length, 7)
  assert.equal(w[0], '2026-11-02')
  assert.equal(w[6], '2026-11-08')
  assert.equal(addDays('2026-10-31', 1), '2026-11-01')
  assert.equal(dayKey(new Date(2026, 10, 5, 23, 30)), '2026-11-05')
})

test('Gerichte eines Tages nach Mahlzeit sortiert', () => {
  const list = [meal({ id: 'a', slot: 'dinner' }), meal({ id: 'b', slot: 'breakfast' }), meal({ id: 'c', date: '2026-11-10' })]
  assert.deepEqual(mealsOn(list, '2026-11-09').map((m) => m.id), ['b', 'a'])
  assert.equal(SLOT_LABEL.dinner, 'Abendessen')
})

test('Kalender: Gericht wird als eigener Tagwerk-Termin angelegt (Ortszeit, Dauer, Verknüpfung)', () => {
  const { events, event } = syncMealEvent([], meal(), new Date('2026-11-05T10:00:00Z'))
  assert.equal(events.length, 1)
  assert.equal(event.mealId, 'm1')
  assert.equal(event.source, 'local')
  assert.equal(event.title, 'Abendessen: Spaghetti mit Tomatensoße')
  const s = new Date(event.start)
  assert.deepEqual([s.getFullYear(), s.getMonth(), s.getDate(), s.getHours(), s.getMinutes()], [2026, 10, 9, 18, 30])
  assert.equal(new Date(event.end).getTime() - s.getTime(), 60 * 60_000)
  assert.equal(event.reminderMinutes, null, 'keine Erinnerung für Essen')
})

test('Kalender: erneutes Speichern aktualisiert denselben Termin (keine Doppelten)', () => {
  const first = syncMealEvent([], meal(), new Date())
  const m = meal({ calendarEventId: first.event.id, date: '2026-11-11', title: 'Pfannkuchen', slot: 'lunch' })
  const again = syncMealEvent(first.events, m, new Date())
  assert.equal(again.events.length, 1)
  assert.equal(again.event.id, first.event.id)
  assert.equal(again.event.title, 'Mittagessen: Pfannkuchen')
  assert.equal(new Date(again.event.start).getDate(), 11)
  // Termin-ID verloren, aber Verknüpfung über mealId vorhanden → trotzdem kein zweiter Termin
  const third = syncMealEvent(again.events, meal({ calendarEventId: undefined }), new Date())
  assert.equal(third.events.length, 1)
})

test('Kalender: von Hand geänderte Uhrzeit bleibt beim erneuten Speichern erhalten', () => {
  const first = syncMealEvent([], meal(), new Date())
  const moved: CalEvent = { ...first.event, start: new Date(2026, 10, 9, 19, 15).toISOString(), end: new Date(2026, 10, 9, 20, 0).toISOString() }
  const again = syncMealEvent([moved], meal({ calendarEventId: first.event.id, title: 'Spaghetti Napoli' }), new Date())
  const s = new Date(again.event.start)
  assert.deepEqual([s.getHours(), s.getMinutes()], [19, 15], 'gleicher Tag → eigene Uhrzeit bleibt')
  assert.equal(again.event.title, 'Abendessen: Spaghetti Napoli')
})

test('Folgeaktionen beim Löschen: Termin und Zutaten werden benannt, Bearbeitetes bleibt', () => {
  const m = meal()
  const { events, event } = syncMealEvent([], m, new Date())
  const withEvent = { ...m, calendarEventId: event.id }
  const picks = ['500 g Spaghetti', '1 Zwiebel'].map((raw, i) => ({ ingredient: parseIngredient(raw, `x${i}`), originKey: `meal:m1:x${i}`, label: m.title }))
  let items = applyAdd([], 'L', planAdd([], 'L', picks), 'Nils', 1)
  items = items.map((i) => (i.name === 'Zwiebel' ? { ...i, edited: true } : i))
  const f = mealFollowUps(withEvent, events, items)
  assert.equal(f.eventId, event.id)
  assert.equal(f.removable, 1)
  assert.deepEqual(f.keptEdited, ['Zwiebel'])
  // ohne Kalender und Liste: nichts zu tun
  const none = mealFollowUps(meal({ id: 'zzz' }), [], [])
  assert.deepEqual([none.eventId, none.removable, none.keptEdited.length], [undefined, 0, 0])
})
