// Rezepte: Suche im Wikibooks-Kochbuch, gespeicherte und eigene Rezepte, Websuche als Ausweg.
import { useRef, useState } from 'react'
import { BookOpen, ChefHat, ExternalLink, Plus, Search, Trash2, WifiOff } from 'lucide-react'
import { parseIngredient } from '@shared/ingredients'
import { webSearchLinks, WIKIBOOKS } from '@shared/recipe-wiki'
import type { RecipeHit } from '@shared/types'
import { useStore } from '@/lib/store'
import { deleteRecipe, newOwnRecipe, saveRecipe } from '@/lib/meals'
import { Dialog, Empty } from '@/components/ui'
import { useMealsUi } from '@/views/Meals'
import { SLOT_LABEL } from '@shared/meals'

type Phase = { k: 'idle' } | { k: 'loading' } | { k: 'done'; q: string; hits: RecipeHit[] } | { k: 'error'; q: string; error: string; offline?: boolean }

export function Recipes() {
  const saved = useStore((s) => s.data.recipes) ?? []
  const online = useStore((s) => s.online)
  const set = useMealsUi((s) => s.set)
  const pickingFor = useMealsUi((s) => s.pickingFor)
  const [q, setQ] = useState('')
  const [phase, setPhase] = useState<Phase>({ k: 'idle' })
  const [own, setOwn] = useState(false)
  const seq = useRef(0)

  const search = async () => {
    const query = q.trim()
    if (!query) return
    const n = ++seq.current
    setPhase({ k: 'loading' })
    const r = await window.tagwerk.recipes.search(query)
    if (n !== seq.current) return
    setPhase(r.ok ? { k: 'done', q: query, hits: r.value } : { k: 'error', q: query, error: r.error, offline: r.offline })
  }
  const open = (target: { page: string } | { recipe: (typeof saved)[number] }) => set({ recipe: { ...target, planFor: pickingFor ?? undefined } })
  const qWeb = phase.k === 'done' || phase.k === 'error' ? phase.q : q

  return (
    <section className="recipes" aria-label="Rezepte">
      {pickingFor && (
        <div className="picking-banner" role="status">
          Rezept für <b>{SLOT_LABEL[pickingFor.slot]}</b> am <b>{new Date(pickingFor.date + 'T12:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</b> aussuchen
          <button className="btn small ghost" onClick={() => set({ pickingFor: null })}>
            Abbrechen
          </button>
        </div>
      )}
      <form
        className="recipe-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          void search()
        }}
      >
        <Search aria-hidden="true" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gericht oder Zutat – z. B. „Nudeln mit Tomatensauce“" aria-label="Rezepte suchen" />
        <button className="btn small primary" type="submit" disabled={!q.trim() || phase.k === 'loading'}>
          Suchen
        </button>
      </form>
      <p className="source-note">
        Rezepte aus dem <a href="https://de.wikibooks.org/wiki/Kochbuch" target="_blank" rel="noreferrer">{WIKIBOOKS.name}</a> – frei lizenziert ({WIKIBOOKS.license.name}). Tagwerk erkennt Mengen nach festen Regeln, ohne KI; bitte vor dem Einkauf kurz prüfen.
      </p>

      {phase.k === 'loading' && (
        <ul className="hit-list" aria-busy="true" aria-label="Suche läuft">
          {[0, 1, 2].map((i) => (
            <li key={i} className="skeleton-row">
              <span className="skeleton" style={{ width: '40%', height: 14 }} />
              <span className="skeleton" style={{ width: '80%', height: 12 }} />
            </li>
          ))}
        </ul>
      )}
      {phase.k === 'error' && (
        <div className="recipe-error" role="alert">
          {phase.offline ? <WifiOff aria-hidden="true" /> : null}
          <p>{phase.error}</p>
          {online && <WebLinks q={qWeb} />}
        </div>
      )}
      {phase.k === 'done' && (
        <>
          {phase.hits.length === 0 ? (
            <Empty icon={<Search />} title={`Kein Rezept zu „${phase.q}“ im Kochbuch`}>
              Versuch ein einzelnes Wort (z. B. „Tomatensauce“) oder such im Web weiter.
            </Empty>
          ) : (
            <ul className="hit-list" aria-label={`${phase.hits.length} Rezepte gefunden`}>
              {phase.hits.map((h) => (
                <li key={h.page}>
                  <button className="hit" onClick={() => open({ page: h.page })}>
                    <b>{h.title}</b>
                    {h.snippet && <span>{h.snippet} …</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <WebLinks q={phase.q} />
        </>
      )}

      <div className="saved-head">
        <h3>Meine Rezepte</h3>
        <span className="n">{saved.length}</span>
        <span className="spacer" />
        <button className="btn small" onClick={() => setOwn(true)}>
          <Plus /> Eigenes Rezept
        </button>
      </div>
      {saved.length === 0 ? (
        <Empty compact icon={<BookOpen />} title="Noch keine gespeicherten Rezepte">
          Öffne ein Rezept und wähle „Speichern“ – dann ist es auch offline da.
        </Empty>
      ) : (
        <ul className="saved-list">
          {saved.map((r) => (
            <li key={r.id} className="saved-row">
              <button className="hit" onClick={() => open({ recipe: r })}>
                <b>{r.title}</b>
                <span>
                  {r.source.kind === 'own' ? 'Eigenes Rezept' : r.source.name} · {r.ingredients.length} Zutaten{r.servings ? ` · ${r.servings} Portionen` : ''}
                </span>
              </button>
              <button className="btn small icon-btn ghost" onClick={() => deleteRecipe(r.id)} aria-label={`„${r.title}“ aus Meine Rezepte entfernen`}>
                <Trash2 />
              </button>
            </li>
          ))}
        </ul>
      )}
      {own && <OwnRecipeDialog onClose={() => setOwn(false)} />}
    </section>
  )
}

function WebLinks({ q }: { q: string }) {
  if (!q.trim()) return null
  return (
    <p className="web-links">
      Im Web weitersuchen (öffnet den Browser, Tagwerk übernimmt dort nichts automatisch):
      {webSearchLinks(q).map((l) => (
        <a key={l.name} className="btn small ghost" href={l.url} target="_blank" rel="noreferrer">
          {l.name} <ExternalLink />
        </a>
      ))}
    </p>
  )
}

function OwnRecipeDialog({ onClose }: { onClose: () => void }) {
  const set = useMealsUi((s) => s.set)
  const [title, setTitle] = useState('')
  const [servings, setServings] = useState('2')
  const [ings, setIngs] = useState('')
  const [steps, setSteps] = useState('')
  const lines = ings.split('\n').map((l) => l.trim()).filter(Boolean)
  const dirty = !!(title || ings || steps)
  const save = () => {
    const r = newOwnRecipe(
      title,
      lines.map((l, i) => parseIngredient(l, `own-${i}`)),
      steps.split('\n').map((s) => s.trim()).filter(Boolean),
      Number(servings) > 0 ? Number(servings) : undefined
    )
    saveRecipe(r)
    onClose()
    set({ recipe: { recipe: r } })
  }
  return (
    <Dialog
      title="Eigenes Rezept"
      size="md"
      dirty={dirty}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn primary" onClick={save} disabled={!title.trim() || !lines.length}>
            <ChefHat /> Speichern
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label>
          Name
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Omas Linsensuppe" autoFocus />
        </label>
        <label>
          Portionen
          <input className="input" type="number" min={1} max={50} value={servings} onChange={(e) => setServings(e.target.value)} style={{ width: 90 }} />
        </label>
        <label className="wide">
          Zutaten – eine pro Zeile
          <textarea className="input" rows={6} value={ings} onChange={(e) => setIngs(e.target.value)} placeholder={'500 g Linsen\n2 Möhren\n1 EL Essig\nSalz'} />
        </label>
        {lines.length > 0 && (
          <p className="parse-preview wide" aria-live="polite">
            Erkannt: {lines.slice(0, 4).map((l) => { const i = parseIngredient(l); return i.qty !== undefined ? `${i.name} (${i.qty}${i.unit ? ` ${i.unit}` : ''})` : i.name }).join(' · ')}
            {lines.length > 4 ? ' …' : ''}
          </p>
        )}
        <label className="wide">
          Zubereitung – ein Schritt pro Zeile (optional)
          <textarea className="input" rows={4} value={steps} onChange={(e) => setSteps(e.target.value)} />
        </label>
      </div>
    </Dialog>
  )
}
