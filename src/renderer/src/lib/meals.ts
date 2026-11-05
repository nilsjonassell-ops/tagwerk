// Essen: Aktionen für Rezepte, Essensplan und Einkaufslisten (lokale Daten über den zentralen Speicher).
import { mealOriginPrefix, syncMealEvent } from '@shared/meals'
import { applyAdd, editItem, planAdd, quickItem, removeOrigins, visibleItems, type AddPick, type ItemPatch, type PlanEntry } from '@shared/shopping'
import type { AppData, Meal, MealSlot, Recipe, ShoppingItem, ShoppingList } from '@shared/types'
import { useStore } from './store'
import { useAccounts } from './accounts'

const S = () => useStore.getState()
export const myName = () => S().settings.userName?.trim() || useAccounts.getState().ms.email || 'Ich'
const iso = () => new Date().toISOString()
const rid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export const DEFAULT_LIST_ID = 'list-default'

/** Es gibt immer mindestens eine Liste */
export function listsOf(d: AppData): ShoppingList[] {
  const l = d.shoppingLists ?? []
  return l.length ? l : [{ id: DEFAULT_LIST_ID, name: 'Einkaufsliste', createdAt: '1970-01-01T00:00:00.000Z' }]
}
function withList(d: AppData, listId: string): AppData {
  if ((d.shoppingLists ?? []).some((l) => l.id === listId)) return d
  const l = listsOf(d).find((x) => x.id === listId) ?? { id: listId, name: 'Einkaufsliste', createdAt: iso() }
  return { ...d, shoppingLists: [...(d.shoppingLists ?? []), l] }
}
export const itemsOf = (d: AppData, listId: string) => (d.shoppingItems ?? []).filter((i) => i.listId === listId)

function setItems(d: AppData, listId: string, items: ShoppingItem[]): AppData {
  const others = (d.shoppingItems ?? []).filter((i) => i.listId !== listId)
  return { ...withList(d, listId), shoppingItems: [...others, ...items] }
}

// ---------- Einkaufsliste ----------

export function addQuick(listId: string, text: string) {
  const t = text.trim()
  if (!t) return
  S().mutate((d) => setItems(d, listId, [...itemsOf(d, listId), quickItem(listId, t, myName(), Date.now())]))
}

export function updateItem(id: string, patch: ItemPatch, opts?: { toast?: string; undoable?: boolean }) {
  S().mutate((d) => ({ ...d, shoppingItems: (d.shoppingItems ?? []).map((i) => (i.id === id ? editItem(i, patch, myName(), Date.now()) : i)) }), opts)
}

export function removeItem(item: ShoppingItem) {
  updateItem(item.id, { deleted: true }, { toast: `„${item.name}“ entfernt`, undoable: true })
}

export function clearDone(listId: string) {
  const n = visibleItems(itemsOf(S().data, listId)).filter((i) => i.done).length
  if (!n) return
  const now = Date.now()
  S().mutate((d) => ({ ...d, shoppingItems: (d.shoppingItems ?? []).map((i) => (i.listId === listId && i.done && !i.deleted ? editItem(i, { deleted: true }, myName(), now) : i)) }), {
    toast: `${n} gekaufte ${n === 1 ? 'Eintrag' : 'Einträge'} entfernt`,
    undoable: true
  })
}

export function createList(name: string): string {
  const id = rid('list')
  S().mutate((d) => ({ ...withList(d, listsOf(d)[0].id), shoppingLists: [...(withList(d, listsOf(d)[0].id).shoppingLists ?? []), { id, name: name.trim() || 'Neue Liste', createdAt: iso() }] }))
  return id
}

export function renameList(id: string, name: string) {
  S().mutate((d) => ({ ...withList(d, id), shoppingLists: (withList(d, id).shoppingLists ?? []).map((l) => (l.id === id ? { ...l, name: name.trim() || l.name } : l)) }))
}

/** Liste vom PC entfernen (bei geteilten Listen: nur die eigene Kopie) */
export function dropList(id: string) {
  S().mutate((d) => {
    const rest = (d.shoppingLists ?? []).filter((l) => l.id !== id)
    return { ...d, shoppingLists: rest, shoppingItems: (d.shoppingItems ?? []).filter((i) => i.listId !== id) }
  })
}

export function setListShare(id: string, share: ShoppingList['share'], name?: string) {
  S().mutate((d) => {
    const base = withList(d, id)
    return { ...base, shoppingLists: (base.shoppingLists ?? []).map((l) => (l.id === id ? { ...l, share, name: name ?? l.name } : l)) }
  })
}

/** Vorschau: was passiert mit den gewählten Zutaten? */
export const previewAdd = (listId: string, picks: AddPick[]): PlanEntry[] => planAdd(itemsOf(S().data, listId), listId, picks)

/** Ausführen – mit Rückgängig. Gibt die Anzahl der geänderten bzw. neuen Einträge zurück. */
export function commitAdd(listId: string, plan: PlanEntry[]): number {
  const n = plan.filter((p) => p.action !== 'duplicate' && p.action !== 'present').length
  const name = listsOf(S().data).find((l) => l.id === listId)?.name ?? 'Einkaufsliste'
  S().mutate((d) => setItems(d, listId, applyAdd(itemsOf(d, listId), listId, plan, myName(), Date.now())), {
    toast: n ? `${n} ${n === 1 ? 'Zutat' : 'Zutaten'} auf „${name}“` : 'Alles stand schon auf der Liste',
    undoable: n > 0
  })
  return n
}

// ---------- Rezepte ----------

export function saveRecipe(r: Recipe) {
  S().mutate((d) => {
    const list = d.recipes ?? []
    const has = list.some((x) => x.id === r.id)
    return { ...d, recipes: has ? list.map((x) => (x.id === r.id ? { ...r, savedAt: x.savedAt, updatedAt: iso() } : x)) : [{ ...r, savedAt: iso(), updatedAt: iso() }, ...list] }
  })
}

export function deleteRecipe(id: string) {
  S().mutate((d) => ({ ...d, recipes: (d.recipes ?? []).filter((r) => r.id !== id) }), { toast: 'Rezept aus „Gespeichert“ entfernt', undoable: true })
}

export function newOwnRecipe(title: string, ingredients: Recipe['ingredients'], steps: string[], servings?: number): Recipe {
  const now = iso()
  return { id: rid('own'), title: title.trim(), source: { kind: 'own', name: 'Eigenes Rezept' }, servings, ingredients, steps, savedAt: now, updatedAt: now }
}

// ---------- Essensplan ----------

export interface MealInput {
  date: string
  slot: MealSlot
  title: string
  recipeId?: string
  servings?: number
  note?: string
  inCalendar: boolean
}

/** Gericht planen oder ändern. Kalendertermin wird angelegt, mitbewegt oder entfernt – nie doppelt. */
export function saveMeal(input: MealInput, id?: string): Meal {
  const d0 = S().data
  const prev = id ? (d0.meals ?? []).find((m) => m.id === id) : undefined
  const now = iso()
  let meal: Meal = {
    ...(prev ?? { id: rid('meal'), createdAt: now }),
    date: input.date,
    slot: input.slot,
    title: input.title.trim() || 'Gericht',
    recipeId: input.recipeId,
    servings: input.servings,
    note: input.note,
    updatedAt: now
  }
  let events = d0.events
  if (input.inCalendar) {
    const r = syncMealEvent(events, meal, new Date())
    events = r.events
    meal = { ...meal, calendarEventId: r.event.id }
  } else {
    events = events.filter((e) => e.mealId !== meal.id && e.id !== meal.calendarEventId)
    meal = { ...meal, calendarEventId: undefined }
  }
  const moved = prev && (prev.date !== meal.date || prev.slot !== meal.slot)
  S().mutate((d) => ({ ...d, events, meals: prev ? (d.meals ?? []).map((m) => (m.id === meal.id ? meal : m)) : [...(d.meals ?? []), meal] }), {
    toast: prev ? (moved && input.inCalendar ? 'Gericht verschoben – der Kalendertermin wurde mitverschoben' : 'Gericht gespeichert') : input.inCalendar ? 'Im Essensplan und im Kalender eingetragen' : 'Im Essensplan eingetragen',
    undoable: true
  })
  return meal
}

/** Gericht löschen. Folgeaktionen nur, wenn ausdrücklich gewählt – Bearbeitetes und Gekauftes bleibt immer. */
export function deleteMeal(id: string, opts: { removeEvent: boolean; removeItems: boolean }) {
  const d0 = S().data
  const meal = (d0.meals ?? []).find((m) => m.id === id)
  if (!meal) return
  let removed = 0
  S().mutate(
    (d) => {
      let items = d.shoppingItems ?? []
      if (opts.removeItems) {
        const r = removeOrigins(items, mealOriginPrefix(id), myName(), Date.now())
        items = r.items
        removed = r.changed
      }
      return {
        ...d,
        meals: (d.meals ?? []).filter((m) => m.id !== id),
        events: opts.removeEvent ? d.events.filter((e) => e.mealId !== id && e.id !== meal.calendarEventId) : d.events.map((e) => (e.mealId === id ? { ...e, mealId: undefined } : e)),
        shoppingItems: items
      }
    },
    { toast: `„${meal.title}“ aus dem Essensplan gelöscht`, undoable: true }
  )
  return removed
}

export const mealPicks = (meal: Meal, ings: Recipe['ingredients']): AddPick[] => ings.map((ingredient) => ({ ingredient, originKey: `${mealOriginPrefix(meal.id)}${ingredient.id}`, label: meal.title }))
export const recipePicks = (r: Recipe, ings: Recipe['ingredients']): AddPick[] => ings.map((ingredient) => ({ ingredient, originKey: `${r.id}:${ingredient.id}`, label: r.title }))
