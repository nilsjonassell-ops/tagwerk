// Gericht planen oder bearbeiten. Beim Löschen werden Folgen (Kalendertermin, Zutaten) offen benannt und abgefragt.
import { useState } from 'react'
import { BookOpen, CalendarCheck, ChefHat, Search, ShoppingCart, Trash2 } from 'lucide-react'
import { dayKey, mealFollowUps, SLOT_LABEL, SLOTS } from '@shared/meals'
import type { MealSlot } from '@shared/types'
import { useStore } from '@/lib/store'
import { deleteMeal, itemsOf, listsOf, saveMeal } from '@/lib/meals'
import { Dialog, Segmented, Select, Switch } from '@/components/ui'
import { useMealsUi } from '@/views/Meals'

export function MealDialog({ target, onClose }: { target: { id?: string; date?: string; slot?: MealSlot }; onClose: () => void }) {
  const data = useStore((s) => s.data)
  const ui = useMealsUi()
  const meal = target.id ? (data.meals ?? []).find((m) => m.id === target.id) : undefined
  const recipes = data.recipes ?? []
  const [title, setTitle] = useState(meal?.title ?? '')
  const [date, setDate] = useState(meal?.date ?? target.date ?? dayKey(new Date()))
  const [slot, setSlot] = useState<MealSlot>(meal?.slot ?? target.slot ?? 'dinner')
  const [recipeId, setRecipeId] = useState<string | undefined>(meal?.recipeId)
  const linkedEvent = meal ? data.events.find((e) => e.id === meal.calendarEventId || e.mealId === meal.id) : undefined
  const [inCal, setInCal] = useState(meal ? !!linkedEvent : true)
  const [note, setNote] = useState(meal?.note ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const recipe = recipes.find((r) => r.id === recipeId)
  const dirty = meal ? title !== meal.title || date !== meal.date || slot !== meal.slot || inCal !== !!linkedEvent || note !== (meal.note ?? '') || recipeId !== meal.recipeId : !!title.trim()

  const save = () => {
    const m = saveMeal({ date, slot, title: title || recipe?.title || '', recipeId, servings: meal?.servings ?? recipe?.servings, note: note.trim() || undefined, inCalendar: inCal }, meal?.id)
    onClose()
    return m
  }

  if (meal && confirmDelete) return <DeleteMeal mealId={meal.id} onDone={onClose} onBack={() => setConfirmDelete(false)} />

  return (
    <Dialog
      title={meal ? 'Gericht bearbeiten' : 'Gericht planen'}
      size="md"
      dirty={dirty}
      onClose={onClose}
      footer={
        <>
          {meal && (
            <button className="btn ghost danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Löschen …
            </button>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={save} disabled={!(title.trim() || recipe)}>
            {meal ? 'Speichern' : 'Planen'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="wide">
          Gericht
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={recipe?.title ?? 'z. B. Spaghetti mit Tomatensauce'} autoFocus={!meal} />
        </label>
        {!meal && (
          <div className="wide pick-recipe">
            <button
              className="btn small"
              onClick={() => {
                ui.set({ meal: null, tab: 'recipes', pickingFor: { date, slot } })
              }}
            >
              <Search /> Rezept suchen
            </button>
            {recipes.length > 0 && (
              <Select
                aria-label="Gespeichertes Rezept"
                placeholder="… oder gespeichertes Rezept"
                value={recipeId}
                onChange={(v) => {
                  setRecipeId(v)
                  const r = recipes.find((x) => x.id === v)
                  if (r && !title.trim()) setTitle(r.title)
                }}
                options={recipes.map((r) => ({ value: r.id, label: r.title }))}
              />
            )}
          </div>
        )}
        <label>
          Tag
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="wide">
          <span className="label">Mahlzeit</span>
          <Segmented label="Mahlzeit" value={slot} onChange={setSlot} options={SLOTS.map((s) => ({ id: s, label: SLOT_LABEL[s] }))} />
        </div>
        <label className="wide">
          Notiz (optional)
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. doppelte Menge für morgen" />
        </label>
      </div>
      <div className="setting-switch">
        <div>
          <b>Auch im Kalender eintragen</b>
          <span>
            {inCal
              ? linkedEvent
                ? 'Steht im Tagwerk-Kalender. Änderungen an Tag oder Mahlzeit verschieben den Termin mit.'
                : 'Wird zusätzlich als Tagwerk-Termin gespeichert (nicht in Google, Outlook oder Apple).'
              : meal && meal.calendarEventId && !linkedEvent
                ? 'Der Kalendertermin wurde im Kalender gelöscht. Einschalten legt ihn neu an.'
                : linkedEvent
                  ? 'Beim Speichern wird der Kalendertermin entfernt.'
                  : 'Steht nur im Essensplan.'}
          </span>
        </div>
        <Switch label="Auch im Kalender eintragen" checked={inCal} onChange={setInCal} />
      </div>
      {meal && (
        <div className="meal-actions">
          {recipe ? (
            <>
              <button className="btn small" onClick={() => ui.set({ meal: null, recipe: { recipe } })}>
                <BookOpen /> Rezept öffnen
              </button>
              <button className="btn small" onClick={() => ui.set({ meal: null, recipe: { recipe, mealId: meal.id } })}>
                <ShoppingCart /> Zutaten zur Einkaufsliste …
              </button>
            </>
          ) : (
            <span className="muted">
              <ChefHat aria-hidden="true" /> Ohne Rezept geplant
            </span>
          )}
          {linkedEvent && (
            <span className="muted">
              <CalendarCheck aria-hidden="true" /> Im Kalender: {new Date(linkedEvent.start).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}
    </Dialog>
  )
}

function DeleteMeal({ mealId, onDone, onBack }: { mealId: string; onDone: () => void; onBack: () => void }) {
  const data = useStore((s) => s.data)
  const meal = (data.meals ?? []).find((m) => m.id === mealId)!
  const f = mealFollowUps(meal, data.events, data.shoppingItems ?? [])
  const [ev, setEv] = useState(true)
  const [items, setItems] = useState(true)
  const listNames = listsOf(data)
    .filter((l) => itemsOf(data, l.id).some((i) => i.origins?.some((o) => o.key.startsWith(`meal:${mealId}:`))))
    .map((l) => l.name)
  return (
    <Dialog
      title={`„${meal.title}“ löschen?`}
      size="sm"
      onClose={onBack}
      footer={
        <>
          <button className="btn" onClick={onBack}>
            Abbrechen
          </button>
          <button
            className="btn danger"
            onClick={() => {
              deleteMeal(mealId, { removeEvent: ev, removeItems: items })
              onDone()
            }}
          >
            Löschen
          </button>
        </>
      }
    >
      <p>Das Gericht wird aus dem Essensplan entfernt. Was soll mit den Folgen passieren?</p>
      {f.eventId ? (
        <label className="check-row">
          <input type="checkbox" checked={ev} onChange={(e) => setEv(e.target.checked)} />
          <span>Kalendertermin ebenfalls entfernen</span>
        </label>
      ) : (
        <p className="muted fine">Kein Kalendertermin verknüpft.</p>
      )}
      {f.removable > 0 ? (
        <label className="check-row">
          <input type="checkbox" checked={items} onChange={(e) => setItems(e.target.checked)} />
          <span>
            Zutaten dieses Gerichts von {listNames.length ? `„${listNames.join('“, „')}“` : 'der Einkaufsliste'} nehmen ({f.removable} {f.removable === 1 ? 'Eintrag' : 'Einträge'} – bei zusammengefassten Einträgen nur der Anteil dieses Gerichts)
          </span>
        </label>
      ) : (
        <p className="muted fine">Keine offenen Zutaten dieses Gerichts auf der Einkaufsliste.</p>
      )}
      {f.keptEdited.length > 0 && <p className="muted fine">Von Hand geändert und deshalb unangetastet: {f.keptEdited.join(', ')}.</p>}
      <p className="muted fine">Bereits Gekauftes bleibt stehen. Du kannst das Löschen danach rückgängig machen.</p>
    </Dialog>
  )
}
