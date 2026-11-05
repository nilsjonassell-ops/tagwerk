// Essensplan: Tage, Mahlzeiten, Verknüpfung mit dem Tagwerk-Kalender und Folgeaktionen.
import type { CalEvent, Meal, MealSlot, ShoppingItem } from './types.ts'

export const SLOT_LABEL: Record<MealSlot, string> = { breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen', snack: 'Snack' }
export const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'snack', 'dinner']
/** Vorschlag für die Uhrzeit im Kalender: [Stunde, Minute, Dauer in Minuten] */
const SLOT_TIME: Record<MealSlot, [number, number, number]> = { breakfast: [8, 0, 30], lunch: [12, 30, 45], snack: [16, 0, 20], dinner: [18, 30, 60] }

const pad = (n: number) => String(n).padStart(2, '0')
/** Kalendertag in Ortszeit */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function addDays(k: string, n: number): string {
  const d = fromKey(k)
  d.setDate(d.getDate() + n)
  return dayKey(d)
}
/** Montag bis Sonntag der Woche, in der dieser Tag liegt */
export function weekDays(k: string): string[] {
  const d = fromKey(k)
  const monday = addDays(k, -((d.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export const mealsOn = (meals: Meal[], day: string) => meals.filter((m) => m.date === day).sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || a.createdAt.localeCompare(b.createdAt))

export const mealTitle = (m: Meal) => `${SLOT_LABEL[m.slot]}: ${m.title}`

/**
 * Termin zum Gericht anlegen oder aktualisieren – nie doppelt (gefunden über calendarEventId oder mealId).
 * Hat jemand die Uhrzeit im Kalender von Hand geändert und der Tag bleibt gleich, bleibt diese Uhrzeit.
 */
export function syncMealEvent(events: CalEvent[], meal: Meal, now: Date): { events: CalEvent[]; event: CalEvent } {
  const existing = events.find((e) => (meal.calendarEventId && e.id === meal.calendarEventId) || e.mealId === meal.id)
  const [h, min, dur] = SLOT_TIME[meal.slot]
  const day = fromKey(meal.date)
  let start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, min)
  let end = new Date(start.getTime() + dur * 60_000)
  if (existing && dayKey(new Date(existing.start)) === meal.date && existing.mealSlot === meal.slot) {
    start = new Date(existing.start)
    end = new Date(existing.end)
  }
  const event: CalEvent = {
    ...(existing ?? { id: `meal-ev-${meal.id}`, attendees: [], source: 'local' as const }),
    title: mealTitle(meal),
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: false,
    notes: meal.note || existing?.notes,
    mealId: meal.id,
    mealSlot: meal.slot,
    reminderMinutes: existing?.reminderMinutes ?? null
  }
  void now
  const next = existing ? events.map((e) => (e.id === existing.id ? event : e)) : [...events, event]
  return { events: next, event }
}

export interface MealFollowUps {
  /** Verknüpfter Kalendertermin */
  eventId?: string
  /** Einträge, die nur wegen dieses Gerichts auf der Liste stehen oder deren Menge zurückgenommen werden kann */
  removable: number
  /** Von Hand geänderte Einträge – bleiben unangetastet */
  keptEdited: string[]
}

export const mealOriginPrefix = (mealId: string) => `meal:${mealId}:`

/** Was hängt an diesem Gericht? Grundlage für die Rückfrage beim Löschen. */
export function mealFollowUps(meal: Meal, events: CalEvent[], items: ShoppingItem[]): MealFollowUps {
  const ev = events.find((e) => (meal.calendarEventId && e.id === meal.calendarEventId) || e.mealId === meal.id)
  const prefix = mealOriginPrefix(meal.id)
  const linked = items.filter((i) => !i.deleted && !i.done && i.origins?.some((o) => o.key.startsWith(prefix)))
  return { eventId: ev?.id, removable: linked.filter((i) => !i.edited).length, keptEdited: linked.filter((i) => i.edited).map((i) => i.name) }
}
