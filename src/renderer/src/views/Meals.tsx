// Essen: Essensplan, Rezepte und Einkaufsliste als ein zusammenhängender Ablauf.
import { create } from 'zustand'
import type { MealSlot, Recipe } from '@shared/types'
import { Segmented, ViewHeader } from '@/components/ui'
import { MealPlan } from '@/components/meals/MealPlan'
import { Recipes } from '@/components/meals/Recipes'
import { ShoppingListView } from '@/components/meals/ShoppingList'
import { RecipeDialog } from '@/components/meals/RecipeDialog'
import { MealDialog } from '@/components/meals/MealDialog'

export type MealsTab = 'plan' | 'recipes' | 'shopping'

/** Rezept öffnen: aus der Suche (Seite laden) oder gespeichert; optional direkt fürs Planen an einem Tag */
export type RecipeTarget = { page: string } | { recipe: Recipe }

interface MealsUi {
  tab: MealsTab
  /** Gewählte Einkaufsliste */
  listId?: string
  recipe: (RecipeTarget & { planFor?: { date: string; slot: MealSlot }; mealId?: string }) | null
  /** Gericht bearbeiten (id) oder neu planen (date) */
  meal: { id?: string; date?: string; slot?: MealSlot } | null
  /** Beim Planen aus der Suche: für diesen Tag wird gerade ein Rezept gesucht */
  pickingFor: { date: string; slot: MealSlot } | null
  set: (p: Partial<Omit<MealsUi, 'set'>>) => void
}

export const useMealsUi = create<MealsUi>((set) => ({ tab: 'plan', recipe: null, meal: null, pickingFor: null, set: (p) => set(p) }))

export function MealsView() {
  const tab = useMealsUi((s) => s.tab)
  const set = useMealsUi((s) => s.set)
  const recipe = useMealsUi((s) => s.recipe)
  const meal = useMealsUi((s) => s.meal)
  return (
    <>
      <ViewHeader title="Essen">
        <Segmented
          label="Bereich"
          value={tab}
          onChange={(t) => set({ tab: t })}
          options={[
            { id: 'plan', label: 'Essensplan' },
            { id: 'recipes', label: 'Rezepte' },
            { id: 'shopping', label: 'Einkaufsliste' }
          ]}
        />
      </ViewHeader>
      <div className="view-body">
        <div className="meals-view" data-tab={tab}>
          {tab === 'plan' && <MealPlan />}
          {tab === 'recipes' && <Recipes />}
          {tab === 'shopping' && <ShoppingListView />}
        </div>
      </div>
      {recipe && <RecipeDialog target={recipe} onClose={() => set({ recipe: null })} />}
      {meal && <MealDialog target={meal} onClose={() => set({ meal: null })} />}
    </>
  )
}
