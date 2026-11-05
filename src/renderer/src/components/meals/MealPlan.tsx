// Essensplan: Woche (Montag–Sonntag) oder einzelner Tag, Gerichte je Mahlzeit, Kennzeichnung „im Kalender“.
import { useState } from 'react'
import { CalendarCheck, ChevronLeft, ChevronRight, Plus, UtensilsCrossed } from 'lucide-react'
import { addDays, dayKey, fromKey, mealsOn, SLOT_LABEL, weekDays } from '@shared/meals'
import type { Meal } from '@shared/types'
import { useStore } from '@/lib/store'
import { Empty, Segmented } from '@/components/ui'
import { useMealsUi } from '@/views/Meals'

const fDay = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
const fLong = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
const fRange = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long' })

export function MealPlan() {
  const meals = useStore((s) => s.data.meals) ?? []
  const events = useStore((s) => s.data.events)
  const set = useMealsUi((s) => s.set)
  const today = dayKey(new Date())
  const [anchor, setAnchor] = useState(today)
  const [mode, setMode] = useState<'week' | 'day'>('week')
  const days = mode === 'week' ? weekDays(anchor) : [anchor]
  const step = mode === 'week' ? 7 : 1
  const inRange = meals.filter((m) => days.includes(m.date)).length
  const label = mode === 'week' ? `${fRange.format(fromKey(days[0]))} – ${fRange.format(fromKey(days[6]))}` : fLong.format(fromKey(anchor))

  return (
    <section className="meal-plan" aria-label="Essensplan">
      <div className="meals-toolbar">
        <div className="pager" role="group" aria-label="Zeitraum">
          <button className="btn small icon-btn" onClick={() => setAnchor(addDays(anchor, -step))} aria-label={mode === 'week' ? 'Vorige Woche' : 'Voriger Tag'}>
            <ChevronLeft />
          </button>
          <button className="btn small" onClick={() => setAnchor(today)} disabled={days.includes(today)}>
            Heute
          </button>
          <button className="btn small icon-btn" onClick={() => setAnchor(addDays(anchor, step))} aria-label={mode === 'week' ? 'Nächste Woche' : 'Nächster Tag'}>
            <ChevronRight />
          </button>
          <h2 className="range" aria-live="polite">
            {label}
          </h2>
        </div>
        <Segmented
          label="Darstellung"
          value={mode}
          onChange={setMode}
          options={[
            { id: 'week', label: 'Woche' },
            { id: 'day', label: 'Tag' }
          ]}
        />
      </div>

      {inRange === 0 && mode === 'week' && (
        <p className="meals-hint">
          Noch nichts geplant. Wähle bei einem Tag <b>Gericht planen</b> oder such dir unter <button className="link" onClick={() => set({ tab: 'recipes' })}>Rezepte</button> etwas aus.
        </p>
      )}

      <div className={`plan-grid ${mode}`}>
        {days.map((d) => {
          const list = mealsOn(meals, d)
          return (
            <article key={d} className={`plan-day ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}`} aria-label={fLong.format(fromKey(d))}>
              <header>
                <button className="day-name" onClick={() => (setAnchor(d), setMode('day'))} title="Nur diesen Tag zeigen">
                  {d === today ? 'Heute' : fDay.format(fromKey(d))}
                </button>
              </header>
              {list.length === 0 && mode === 'day' && <Empty compact icon={<UtensilsCrossed />} title="Für diesen Tag ist nichts geplant" />}
              <ul>
                {list.map((m) => (
                  <MealCard key={m.id} m={m} inCalendar={!!m.calendarEventId && events.some((e) => e.id === m.calendarEventId)} />
                ))}
              </ul>
              <button className="btn small ghost add-meal" onClick={() => set({ meal: { date: d } })}>
                <Plus /> Gericht planen
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function MealCard({ m, inCalendar }: { m: Meal; inCalendar: boolean }) {
  const set = useMealsUi((s) => s.set)
  return (
    <li>
      <button className="meal-card" onClick={() => set({ meal: { id: m.id } })}>
        <span className="slot">{SLOT_LABEL[m.slot]}</span>
        <span className="title">{m.title}</span>
        <span className={`where ${inCalendar ? 'cal' : ''}`}>
          {inCalendar ? (
            <>
              <CalendarCheck aria-hidden="true" /> Auch im Kalender
            </>
          ) : (
            'Nur im Essensplan'
          )}
        </span>
      </button>
    </li>
  )
}
