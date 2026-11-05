// Einkaufsliste: nach Bereichen gruppiert, Gekauftes darunter, Schnelleingabe, Bearbeiten, Teilen und Abgleich-Status.
import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, CloudOff, ListPlus, LogIn, Pencil, Plus, RefreshCw, ShoppingCart, Trash2, Users } from 'lucide-react'
import { formatAmount, parseIngredient } from '@shared/ingredients'
import { CATEGORY_LABEL, CATEGORY_ORDER, visibleItems } from '@shared/shopping'
import type { ShoppingCategory, ShoppingItem, ShoppingList } from '@shared/types'
import { useStore } from '@/lib/store'
import { addQuick, clearDone, createList, itemsOf, listsOf, removeItem, updateItem } from '@/lib/meals'
import { syncList, useShareSync } from '@/lib/shoppingSync'
import { Empty, Select } from '@/components/ui'
import { useMealsUi } from '@/views/Meals'
import { JoinDialog, ShareDialog } from './ShareDialog'

const fTime = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

export function ShoppingListView() {
  const data = useStore((s) => s.data)
  const ui = useMealsUi()
  const lists = listsOf(data)
  const list = lists.find((l) => l.id === ui.listId) ?? lists[0]
  const items = visibleItems(itemsOf(data, list.id))
  const open = items.filter((i) => !i.done)
  const done = items.filter((i) => i.done)
  const [text, setText] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [share, setShare] = useState(false)
  const [join, setJoin] = useState(false)
  const [newList, setNewList] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const parsed = text.trim() ? parseIngredient(text) : null

  const groups = useMemo(() => {
    const by = new Map<ShoppingCategory, ShoppingItem[]>()
    for (const i of open) by.set(i.category, [...(by.get(i.category) ?? []), i])
    return CATEGORY_ORDER.filter((c) => by.has(c)).map((c) => ({ c, items: by.get(c)!.sort((a, b) => a.name.localeCompare(b.name, 'de')) }))
  }, [open])

  const add = () => {
    if (!text.trim()) return
    addQuick(list.id, text)
    setText('')
    input.current?.focus()
  }

  return (
    <section className="shopping" aria-label="Einkaufsliste">
      <div className="meals-toolbar">
        <div className="list-pick">
          {lists.length > 1 ? (
            <Select aria-label="Einkaufsliste wählen" value={list.id} onChange={(v) => ui.set({ listId: v })} options={lists.map((l) => ({ value: l.id, label: l.share ? `${l.name} · geteilt` : l.name }))} />
          ) : (
            <h2 className="range">{list.name}</h2>
          )}
          <SyncPill list={list} />
        </div>
        <div className="actions">
          {newList === null ? (
            <button className="btn small ghost" onClick={() => setNewList('')}>
              <ListPlus /> Neue Liste
            </button>
          ) : (
            <form
              className="newlist-form"
              onSubmit={(e) => {
                e.preventDefault()
                const id = createList(newList || 'Neue Liste')
                ui.set({ listId: id })
                setNewList(null)
              }}
            >
              <input className="input small" autoFocus value={newList} onChange={(e) => setNewList(e.target.value)} placeholder="Name, z. B. WG" aria-label="Name der neuen Liste" onKeyDown={(e) => e.key === 'Escape' && setNewList(null)} />
              <button className="btn small primary" type="submit">
                Anlegen
              </button>
            </form>
          )}
          <button className="btn small ghost" onClick={() => setJoin(true)}>
            <LogIn /> Liste beitreten
          </button>
          <button className={`btn small ${list.share ? '' : 'primary'}`} onClick={() => setShare(true)}>
            <Users /> {list.share ? 'Geteilt' : 'Teilen'}
          </button>
        </div>
      </div>

      <div className="quick-add">
        <Plus aria-hidden="true" />
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
            if (e.key === 'Escape') setText('')
          }}
          placeholder="Artikel hinzufügen – z. B. „500 g Nudeln“ oder „Milch“"
          aria-label="Artikel hinzufügen"
          aria-describedby="shop-add-help"
        />
        {parsed && (
          <button className="btn small primary" onClick={add}>
            Hinzufügen
          </button>
        )}
      </div>
      <div className="quick-add-preview" id="shop-add-help" aria-live="polite">
        {parsed ? (
          <>
            {parsed.qty !== undefined && <span className="tag accent">{formatAmount(parsed.qty, parsed.qtyMax, parsed.unit)}</span>}
            <span className="tag">{parsed.name}</span>
          </>
        ) : list.share ? (
          <span>Änderungen sehen alle, die Zugriff haben – meist nach wenigen Sekunden.</span>
        ) : (
          <span>Diese Liste ist nur bei dir (und auf deinen PCs mit Cloud-Speicher). Mit „Teilen“ kauft ihr gemeinsam ein.</span>
        )}
      </div>

      {items.length === 0 && (
        <Empty icon={<ShoppingCart />} title="Die Liste ist leer">
          Tippe oben einen Artikel ein oder füge Zutaten aus einem{' '}
          <button className="link" onClick={() => ui.set({ tab: 'recipes' })}>
            Rezept
          </button>{' '}
          hinzu.
        </Empty>
      )}
      {items.length > 0 && open.length === 0 && <p className="meals-hint">Alles gekauft.</p>}

      {groups.map((g) => (
        <section key={g.c} className="shop-group" aria-label={CATEGORY_LABEL[g.c]}>
          <div className="task-group-head">
            <h3>{CATEGORY_LABEL[g.c]}</h3>
            <span className="n">{g.items.length}</span>
          </div>
          <ul>
            {g.items.map((i) => (
              <ItemRow key={i.id} item={i} />
            ))}
          </ul>
        </section>
      ))}

      {done.length > 0 && (
        <section className="shop-group done" aria-label="Gekauft">
          <div className="task-group-head">
            <button className="disclosure" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
              <ChevronDown aria-hidden="true" /> <h3>Gekauft</h3>
            </button>
            <span className="n">{done.length}</span>
            <span className="spacer" />
            <button className="btn small ghost" onClick={() => clearDone(list.id)}>
              <Trash2 /> Gekaufte entfernen
            </button>
          </div>
          {showDone && (
            <ul>
              {done.map((i) => (
                <ItemRow key={i.id} item={i} />
              ))}
            </ul>
          )}
        </section>
      )}

      {share && <ShareDialog list={list} onClose={() => setShare(false)} />}
      {join && <JoinDialog onClose={() => setJoin(false)} onJoined={(id) => ui.set({ listId: id })} />}
    </section>
  )
}

function SyncPill({ list }: { list: ShoppingList }) {
  const st = useShareSync((s) => s.status[list.id])
  if (!list.share) return <span className="sync-pill local">Nur bei dir</span>
  const pending = st?.pending ?? 0
  const last = st?.lastSync ?? list.share.lastSync
  if (st?.state === 'offline')
    return (
      <span className="sync-pill offline" role="status">
        <CloudOff aria-hidden="true" /> Offline{pending ? ` – ${pending} ${pending === 1 ? 'Änderung wartet' : 'Änderungen warten'}` : ''}
      </span>
    )
  if (st?.state === 'error')
    return (
      <span className="sync-pill error" role="status" title={st.error}>
        <AlertTriangle aria-hidden="true" /> {st.error}
        <button className="link" onClick={() => void syncList(list)}>
          Erneut versuchen
        </button>
      </span>
    )
  return (
    <span className="sync-pill ok" role="status">
      {st?.state === 'syncing' ? <RefreshCw className="spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
      {st?.state === 'syncing' ? 'Gleicht ab …' : pending ? `${pending} ${pending === 1 ? 'Änderung' : 'Änderungen'} werden gesendet` : `Geteilt · aktuell${last ? ` (${fTime.format(new Date(last))})` : ''}`}
    </span>
  )
}

function ItemRow({ item }: { item: ShoppingItem }) {
  const [edit, setEdit] = useState(false)
  const amount = formatAmount(item.qty, item.qtyMax, item.unit)
  const from = [...new Set((item.origins ?? []).map((o) => o.label))]
  if (edit) return <EditRow item={item} onDone={() => setEdit(false)} />
  return (
    <li className={`shop-row ${item.done ? 'is-done' : ''}`}>
      <button className={`check ${item.done ? 'done' : ''}`} onClick={() => updateItem(item.id, { done: !item.done })} aria-label={item.done ? `„${item.name}“ wieder auf die Liste` : `„${item.name}“ abhaken`} aria-pressed={item.done}>
        <Check />
      </button>
      <button className="title-btn" onClick={() => setEdit(true)} aria-label={`„${item.name}“ bearbeiten`}>
        {amount && <span className="amount">{amount}</span>}
        <span className="name">{item.name}</span>
        {(item.note || from.length > 0) && (
          <span className="meta">
            {item.note}
            {item.note && from.length > 0 ? ' · ' : ''}
            {from.length > 0 && `für ${from.join(', ')}`}
          </span>
        )}
      </button>
      <div className="row-actions">
        <button className="btn small icon-btn ghost" onClick={() => setEdit(true)} aria-label={`„${item.name}“ bearbeiten`} tabIndex={-1}>
          <Pencil />
        </button>
        <button className="btn small icon-btn ghost" onClick={() => removeItem(item)} aria-label={`„${item.name}“ löschen`}>
          <Trash2 />
        </button>
      </div>
    </li>
  )
}

function EditRow({ item, onDone }: { item: ShoppingItem; onDone: () => void }) {
  const [name, setName] = useState(item.name)
  const [amount, setAmount] = useState(formatAmount(item.qty, item.qtyMax, item.unit))
  const [note, setNote] = useState(item.note ?? '')
  const [cat, setCat] = useState<ShoppingCategory>(item.category)
  const save = () => {
    const a = amount.trim() ? parseIngredient(`${amount.trim()} x`) : null
    const qty = a?.qty
    updateItem(item.id, { name, qty, qtyMax: a?.qtyMax, unit: qty !== undefined ? a?.unit : undefined, note: note.trim() || undefined, category: cat })
    onDone()
  }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') {
      e.stopPropagation()
      onDone()
    }
  }
  return (
    <li className="shop-row editing">
      <div className="edit-fields" onKeyDown={keys}>
        <input className="input small" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Menge" aria-label="Menge und Einheit" style={{ width: 110 }} />
        <input className="input small" value={name} onChange={(e) => setName(e.target.value)} aria-label="Artikel" autoFocus />
        <input className="input small" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notiz" aria-label="Notiz" />
        <Select size="small" aria-label="Bereich" value={cat} onChange={setCat} options={CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} />
      </div>
      <div className="edit-actions">
        <button className="btn small" onClick={onDone}>
          Abbrechen
        </button>
        <button className="btn small primary" onClick={save} disabled={!name.trim()}>
          Speichern
        </button>
      </div>
    </li>
  )
}
