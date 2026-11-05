// Rezeptansicht in Schritten: Rezept & Zutaten wählen → (optional) planen → Übersicht → hinzugefügt.
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, Bookmark, BookmarkCheck, CalendarPlus, Check, ChevronDown, Clock, ExternalLink, Minus, Plus, ShoppingCart, Users } from 'lucide-react'
import { formatAmount, scaleIngredient } from '@shared/ingredients'
import { dayKey, SLOT_LABEL, SLOTS } from '@shared/meals'
import type { Ingredient, Meal, MealSlot, Recipe } from '@shared/types'
import type { PlanEntry } from '@shared/shopping'
import { useStore } from '@/lib/store'
import { commitAdd, listsOf, mealPicks, previewAdd, recipePicks, saveMeal, saveRecipe } from '@/lib/meals'
import { Dialog, Segmented, Select, Switch } from '@/components/ui'
import { useMealsUi, type RecipeTarget } from '@/views/Meals'

type Step = 'view' | 'plan' | 'review' | 'done'
const ACTION_LABEL: Record<PlanEntry['action'], string> = { new: 'Neu', merge: 'Wird ergänzt', separate: 'Eigener Eintrag', duplicate: 'Übersprungen', present: 'Übersprungen' }

export function RecipeDialog({ target, onClose }: { target: RecipeTarget & { planFor?: { date: string; slot: MealSlot }; mealId?: string }; onClose: () => void }) {
  const saved = useStore((s) => s.data.recipes) ?? []
  const data = useStore((s) => s.data)
  const ui = useMealsUi()
  const [recipe, setRecipe] = useState<Recipe | null>('recipe' in target ? target.recipe : (saved.find((r) => r.id === `wb:${target.page}`) ?? null))
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<Step>(target.planFor ? 'plan' : 'view')
  // Aus einem geplanten Gericht geöffnet: Zutaten gehören zu diesem Gericht (lassen sich beim Löschen zurücknehmen)
  const linkedMeal = target.mealId ? (data.meals ?? []).find((m) => m.id === target.mealId) : undefined
  const [servings, setServings] = useState<number | undefined>(linkedMeal?.servings)
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [showSteps, setShowSteps] = useState(false)
  const lists = listsOf(data)
  const [listId, setListId] = useState(ui.listId && lists.some((l) => l.id === ui.listId) ? ui.listId : lists[0].id)
  const [meal, setMeal] = useState<Meal | null>(linkedMeal ?? null)
  const [added, setAdded] = useState(0)

  // Rezept aus der Suche laden (gespeicherte sind sofort da)
  useEffect(() => {
    if (recipe || !('page' in target)) return
    let alive = true
    void window.tagwerk.recipes.get(target.page).then((r) => {
      if (!alive) return
      if (r.ok) setRecipe(r.value)
      else setError(r.error)
    })
    return () => {
      alive = false
    }
  }, [target, recipe])

  const base = recipe?.servings
  const portions = servings ?? base ?? 2
  const factor = base ? portions / base : 1
  const ings = useMemo(() => (recipe?.ingredients ?? []).map((i) => scaleIngredient(i, factor)), [recipe, factor])
  // Was schon auf der Liste steht (gleiches Rezept), ist vorab abgewählt – ebenso Zutaten ohne Menge, die schon da sind
  const already = useMemo(() => {
    if (!recipe) return new Map<string, string>()
    const p = previewAdd(listId, meal ? mealPicks(meal, ings) : recipePicks(recipe, ings))
    return new Map(p.filter((e) => e.action === 'duplicate' || e.action === 'present').map((e) => [e.ingredient.id, e.reason ?? 'Schon auf der Liste']))
  }, [recipe, ings, listId, data.shoppingItems, meal]) // eslint-disable-line react-hooks/exhaustive-deps
  const sel = selected ?? new Set(ings.filter((i) => !already.has(i.id)).map((i) => i.id))
  const chosen = ings.filter((i) => sel.has(i.id))
  const isSaved = !!recipe && saved.some((r) => r.id === recipe.id)

  const toggle = (id: string) => {
    const next = new Set(sel)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }
  const plan = useMemo(() => (recipe && step === 'review' ? previewAdd(listId, meal ? mealPicks(meal, chosen) : recipePicks(recipe, chosen)) : []), [step, listId, meal, recipe, chosen.map((c) => c.id + c.qty).join()]) // eslint-disable-line react-hooks/exhaustive-deps

  const title = step === 'plan' ? 'Zum Essensplan hinzufügen' : step === 'review' ? 'Zutaten prüfen' : step === 'done' ? 'Auf der Einkaufsliste' : (recipe?.title ?? 'Rezept')

  if (error)
    return (
      <Dialog title="Rezept" size="sm" onClose={onClose} footer={<button className="btn" onClick={onClose}>Schließen</button>}>
        <div className="recipe-error" role="alert">
          <AlertTriangle aria-hidden="true" />
          <p>{error}</p>
          {'page' in target && (
            <a className="btn small ghost" href={`https://de.wikibooks.org/wiki/${encodeURIComponent(target.page.replace(/ /g, '_')).replace(/%2F/g, '/')}`} target="_blank" rel="noreferrer">
              Original öffnen <ExternalLink />
            </a>
          )}
        </div>
      </Dialog>
    )

  if (!recipe)
    return (
      <Dialog title="Rezept wird geladen …" size="lg" onClose={onClose}>
        <div className="recipe-loading" aria-busy="true">
          <span className="skeleton" style={{ width: '50%', height: 22 }} />
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="skeleton" style={{ width: `${70 - i * 8}%`, height: 14 }} />
          ))}
        </div>
      </Dialog>
    )

  const footer =
    step === 'view' ? (
      <>
        <button className="btn ghost" onClick={() => saveRecipe(recipe)} aria-pressed={isSaved} disabled={isSaved}>
          {isSaved ? <BookmarkCheck /> : <Bookmark />} {isSaved ? 'Gespeichert' : 'Speichern'}
        </button>
        <span className="spacer" />
        {!linkedMeal && (
          <button className="btn" onClick={() => setStep('plan')}>
            <CalendarPlus /> Zum Essensplan …
          </button>
        )}
        <button className="btn primary" onClick={() => setStep('review')} disabled={!chosen.length}>
          <ShoppingCart /> {chosen.length ? `${chosen.length} ${chosen.length === 1 ? 'Zutat' : 'Zutaten'} zur Einkaufsliste …` : 'Zutaten auswählen'}
        </button>
      </>
    ) : step === 'review' ? (
      <>
        <button className="btn ghost" onClick={() => setStep(meal && !linkedMeal ? 'done' : 'view')}>
          <ArrowLeft /> {meal && !linkedMeal ? 'Ohne Zutaten fertig' : 'Zurück'}
        </button>
        <span className="spacer" />
        <button
          className="btn primary"
          disabled={!plan.some((p) => p.action !== 'duplicate' && p.action !== 'present')}
          onClick={() => {
            setAdded(commitAdd(listId, plan))
            setStep('done')
          }}
        >
          <ShoppingCart /> Zur Einkaufsliste hinzufügen
        </button>
      </>
    ) : step === 'done' ? (
      <>
        <button className="btn" onClick={onClose}>
          Fertig
        </button>
        {added > 0 && (
          <button
            className="btn primary"
            onClick={() => {
              ui.set({ tab: 'shopping', listId, recipe: null, pickingFor: null })
            }}
          >
            Einkaufsliste öffnen
          </button>
        )}
      </>
    ) : null

  return (
    <Dialog title={title} size="lg" onClose={onClose} footer={footer} bodyClass="dialog-body recipe-body">
      {step !== 'done' && (
        <div className="recipe-head">
          {step !== 'view' && <p className="recipe-for">{recipe.title}</p>}
          <SourceLine recipe={recipe} />
        </div>
      )}

      {step === 'view' && (
        <>
          <div className="recipe-meta">
            {base ? (
              <div className="stepper" role="group" aria-label="Portionen">
                <Users aria-hidden="true" />
                <button className="btn small icon-btn" onClick={() => setServings(Math.max(1, portions - 1))} aria-label="Eine Portion weniger" disabled={portions <= 1}>
                  <Minus />
                </button>
                <output aria-live="polite">{portions} {portions === 1 ? 'Portion' : 'Portionen'}</output>
                <button className="btn small icon-btn" onClick={() => setServings(Math.min(50, portions + 1))} aria-label="Eine Portion mehr">
                  <Plus />
                </button>
              </div>
            ) : (
              <span className="muted">
                <Users aria-hidden="true" /> {recipe.servingsText ? `Für ${recipe.servingsText}` : 'Portionen nicht angegeben'} – Mengen wie im Original
              </span>
            )}
            {recipe.time && (
              <span className="muted">
                <Clock aria-hidden="true" /> {recipe.time}
              </span>
            )}
            {factor !== 1 && <span className="tag accent">Mengen umgerechnet{recipe.servingsText && recipe.servingsText !== String(base) ? ` (Original: ${recipe.servingsText})` : ''}</span>}
          </div>
          {recipe.variantNote && <p className="variant-note">{recipe.variantNote}</p>}

          <div className="ing-head">
            <h3>Zutaten</h3>
            <span className="n">{chosen.length} von {ings.length} ausgewählt</span>
            <span className="spacer" />
            <button className="link" onClick={() => setSelected(new Set(ings.map((i) => i.id)))}>
              Alle
            </button>
            <button className="link" onClick={() => setSelected(new Set())}>
              Keine
            </button>
          </div>
          <p className="ing-help">Hast du etwas schon zu Hause? Einfach abwählen.</p>
          <ul className="ing-list">
            {ings.map((i) => (
              <IngredientRow key={i.id} ing={i} checked={sel.has(i.id)} onToggle={() => toggle(i.id)} note={already.get(i.id)} />
            ))}
          </ul>

          {recipe.steps.length > 0 && (
            <div className="steps">
              <button className="disclosure" aria-expanded={showSteps} onClick={() => setShowSteps(!showSteps)}>
                <ChevronDown aria-hidden="true" /> Zubereitung ({recipe.steps.length} {recipe.steps.length === 1 ? 'Schritt' : 'Schritte'})
              </button>
              {showSteps && (
                <ol>
                  {recipe.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </>
      )}

      {step === 'plan' && (
        <PlanStep
          recipe={recipe}
          initial={target.planFor ?? (ui.pickingFor || undefined)}
          servings={portions}
          onBack={target.planFor ? onClose : () => setStep('view')}
          onSaved={(m, withIngredients, p) => {
            setMeal(m)
            if (p !== portions) setServings(p)
            ui.set({ pickingFor: null })
            setStep(withIngredients ? 'review' : 'done')
          }}
        />
      )}

      {step === 'review' && (
        <div className="review">
          {lists.length > 1 && (
            <div className="row-inline">
              <span>Liste</span>
              <Select aria-label="Einkaufsliste" value={listId} onChange={setListId} options={lists.map((l) => ({ value: l.id, label: l.share ? `${l.name} (geteilt)` : l.name }))} />
            </div>
          )}
          {meal && !linkedMeal && <p className="muted">„{meal.title}“ ist für {SLOT_LABEL[meal.slot]} am {new Date(meal.date + 'T12:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })} geplant. Wähle ab, was du schon hast:</p>}
          {meal && !linkedMeal && (
            <ul className="ing-list compact">
              {ings.map((i) => (
                <IngredientRow key={i.id} ing={i} checked={sel.has(i.id)} onToggle={() => toggle(i.id)} note={already.get(i.id)} />
              ))}
            </ul>
          )}
          <h3>Das passiert auf der Liste</h3>
          {plan.length === 0 ? (
            <p className="muted">Keine Zutat ausgewählt.</p>
          ) : (
            <ul className="add-list">
              {plan.map((p) => (
                <li key={p.originKey} className={`add-row ${p.action}`}>
                  <span className={`tag ${p.action === 'new' ? 'accent' : p.action === 'merge' ? 'ok' : p.action === 'separate' ? 'warn' : ''}`}>{ACTION_LABEL[p.action]}</span>
                  <span className="what">
                    <b>{p.ingredient.name}</b> {formatAmount(p.ingredient.qty, p.ingredient.qtyMax, p.ingredient.unit)}
                    {p.action === 'merge' && p.resultText && <span className="muted"> → zusammen {p.resultText}</span>}
                  </span>
                  {p.reason && <span className="why">{p.reason}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="muted fine">Zusammengefasst wird nur bei gleicher oder umrechenbarer Einheit (g/kg, ml/l, EL/TL). Alles andere bleibt ein eigener Eintrag.</p>
        </div>
      )}

      {step === 'done' && (
        <div className="done-state" role="status">
          <span className="ok-mark">
            <Check />
          </span>
          {meal && !linkedMeal && <p>„{meal.title}“ steht im Essensplan{meal.calendarEventId ? ' und im Kalender' : ''}.</p>}
          {added > 0 ? <p>{added} {added === 1 ? 'Zutat ist' : 'Zutaten sind'} jetzt auf „{lists.find((l) => l.id === listId)?.name}“.</p> : meal ? null : <p>Alles stand schon auf der Liste.</p>}
        </div>
      )}
    </Dialog>
  )
}

function IngredientRow({ ing, checked, onToggle, note }: { ing: Ingredient; checked: boolean; onToggle: () => void; note?: string }) {
  const amount = formatAmount(ing.qty, ing.qtyMax, ing.unit)
  return (
    <li>
      <label className={`ing-row ${checked ? '' : 'off'}`}>
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span className="amount">{amount || '–'}</span>
        <span className="name">
          {ing.name}
          {ing.note && <span className="note"> · {ing.note}</span>}
          {ing.group && <span className="note"> · {ing.group}</span>}
        </span>
        {note && <span className="tag">{note}</span>}
      </label>
    </li>
  )
}

function SourceLine({ recipe }: { recipe: Recipe }) {
  const s = recipe.source
  if (s.kind === 'own') return <p className="source-line">Eigenes Rezept</p>
  return (
    <p className="source-line">
      Quelle:{' '}
      <a href={s.url} target="_blank" rel="noreferrer">
        {s.name} <ExternalLink aria-hidden="true" />
      </a>
      {s.authorsUrl && (
        <>
          {' '}
          · <a href={s.authorsUrl} target="_blank" rel="noreferrer">Autorinnen und Autoren</a>
        </>
      )}
      {s.license && (
        <>
          {' '}
          · Lizenz <a href={s.license.url} target="_blank" rel="noreferrer">{s.license.name}</a>
        </>
      )}
    </p>
  )
}

function PlanStep({ recipe, initial, servings, onBack, onSaved }: { recipe: Recipe; initial?: { date: string; slot: MealSlot }; servings: number; onBack: () => void; onSaved: (m: Meal, withIngredients: boolean, servings: number) => void }) {
  const [date, setDate] = useState(initial?.date ?? dayKey(new Date()))
  const [slot, setSlot] = useState<MealSlot>(initial?.slot ?? 'dinner')
  const [n, setN] = useState(String(servings))
  const [inCal, setInCal] = useState(true)
  const [withIng, setWithIng] = useState(recipe.ingredients.length > 0)
  const save = () => {
    const p = Number(n) > 0 ? Math.min(50, Number(n)) : servings
    const m = saveMeal({ date, slot, title: recipe.title, recipeId: recipe.id, servings: p, inCalendar: inCal })
    // Gespeichert wird das Rezept mit, damit das Gericht es auch offline öffnen kann
    saveRecipe(recipe)
    onSaved(m, withIng, p)
  }
  return (
    <div className="plan-step">
      <div className="form-grid">
        <label>
          Tag
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          Portionen
          <input className="input" type="number" min={1} max={50} value={n} onChange={(e) => setN(e.target.value)} style={{ width: 90 }} />
        </label>
        <div className="wide">
          <span className="label">Mahlzeit</span>
          <Segmented label="Mahlzeit" value={slot} onChange={setSlot} options={SLOTS.map((s) => ({ id: s, label: SLOT_LABEL[s] }))} />
        </div>
      </div>
      <div className="setting-switch">
        <div>
          <b>Auch im Kalender eintragen</b>
          <span>{inCal ? 'Wird zusätzlich als Tagwerk-Termin gespeichert (nicht in Google, Outlook oder Apple). Verschiebst du das Gericht, wandert der Termin mit.' : 'Steht nur im Essensplan.'}</span>
        </div>
        <Switch label="Auch im Kalender eintragen" checked={inCal} onChange={setInCal} />
      </div>
      <div className="setting-switch">
        <div>
          <b>Danach Zutaten zur Einkaufsliste</b>
          <span>Du siehst vorher eine Übersicht und kannst Vorhandenes abwählen.</span>
        </div>
        <Switch label="Danach Zutaten zur Einkaufsliste" checked={withIng} onChange={setWithIng} disabled={!recipe.ingredients.length} />
      </div>
      <div className="step-actions">
        <button className="btn ghost" onClick={onBack}>
          <ArrowLeft /> Zurück
        </button>
        <span className="spacer" />
        <button className="btn primary" onClick={save} disabled={!date}>
          <CalendarPlus /> Planen
        </button>
      </div>
    </div>
  )
}
