// Abgleich geteilter Einkaufslisten: alle paar Sekunden und kurz nach jeder eigenen Änderung.
// Offline bleiben Änderungen lokal und werden gesendet, sobald die Verbindung wieder da ist.
import { create } from 'zustand'
import { FIELD_LABEL, mergeItems, pendingCount } from '@shared/shopping'
import type { ShoppingList } from '@shared/types'
import { useStore } from './store'
import { itemsOf, setListShare } from './meals'

export type ShareState = 'idle' | 'syncing' | 'offline' | 'error'
export interface ListSyncStatus {
  state: ShareState
  error?: string
  lastSync?: string
  /** Lokale Änderungen, die noch nicht in der gemeinsamen Liste sind */
  pending: number
}

export const useShareSync = create<{ status: Record<string, ListSyncStatus>; set: (id: string, s: Partial<ListSyncStatus>) => void }>((set) => ({
  status: {},
  set: (id, s) => set((st) => ({ status: { ...st.status, [id]: { ...(st.status[id] ?? { state: 'idle', pending: 0 }), ...s } } }))
}))

const S = () => useStore.getState()

const running = new Set<string>()
const again = new Set<string>()

export async function syncList(list: ShoppingList): Promise<void> {
  if (!list.share) return
  if (running.has(list.id)) {
    again.add(list.id)
    return
  }
  running.add(list.id)
  const st = useShareSync.getState()
  try {
    st.set(list.id, { state: 'syncing' })
    const local = itemsOf(S().data, list.id)
    const r = await window.tagwerk.shopping.sync(list.share, local, list.name)
    if (!r.ok) {
      const cur = itemsOf(S().data, list.id)
      st.set(list.id, { state: r.code === 'offline' ? 'offline' : 'error', error: r.error, pending: pendingCount(cur) })
      return
    }
    // Während des Abgleichs Geändertes bleibt erhalten: noch einmal mit dem aktuellen Stand zusammenführen
    const current = itemsOf(S().data, list.id)
    const merged = mergeItems(current, r.value.items).items.map((i) => ({ ...i, listId: list.id }))
    const changed = JSON.stringify(merged) !== JSON.stringify(current)
    if (changed) {
      S().replaceData({ ...S().data, shoppingItems: [...(S().data.shoppingItems ?? []).filter((i) => i.listId !== list.id), ...merged] })
    }
    const at = new Date().toISOString()
    // Nur speichern, wenn sich etwas Dauerhaftes ändert (Name) – der Zeitpunkt steht im Status, nicht in den Daten
    if (r.value.name && r.value.name !== list.name) setListShare(list.id, { ...list.share, lastSync: at }, r.value.name)
    st.set(list.id, { state: 'idle', error: undefined, lastSync: at, pending: pendingCount(merged) })
    for (const c of r.value.conflicts.slice(0, 2)) {
      S().toast(`Gleichzeitig geändert: „${c.name}“ (${FIELD_LABEL[c.field]}) – die neuere Änderung${c.by ? ` von ${c.by}` : ''} gilt.`)
    }
    if (pendingCount(merged)) again.add(list.id)
  } finally {
    running.delete(list.id)
    if (again.delete(list.id)) {
      const l = (S().data.shoppingLists ?? []).find((x) => x.id === list.id)
      if (l) setTimeout(() => void syncList(l), 400)
    }
  }
}

let timer: ReturnType<typeof setInterval> | null = null
let debounce: ReturnType<typeof setTimeout> | null = null

/** Läuft, solange die App offen ist: alle 5 s (Fenster im Vordergrund) bzw. 30 s im Hintergrund, und kurz nach eigenen Änderungen */
export function startShareSync() {
  if (timer) return
  let tick = 0
  const shared = () => (S().data.shoppingLists ?? []).filter((l) => l.share)
  timer = setInterval(() => {
    tick++
    if (!document.hasFocus() && tick % 6 !== 0) return
    for (const l of shared()) void syncList(l)
  }, 5000)
  let lastItems = S().data.shoppingItems
  useStore.subscribe((st) => {
    if (st.data.shoppingItems === lastItems) return
    lastItems = st.data.shoppingItems
    const lists = shared()
    if (!lists.length) return
    for (const l of lists) useShareSync.getState().set(l.id, { pending: pendingCount(itemsOf(st.data, l.id)) })
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => lists.forEach((l) => void syncList(l)), 700)
  })
  window.addEventListener('online', () => shared().forEach((l) => void syncList(l)))
  // Web-Vorschau: zweiter Tab ändert die gemeinsame Datei → sofort abgleichen
  window.addEventListener('storage', (e) => {
    if (e.key === 'tagwerk-web:shared-drive') shared().forEach((l) => void syncList(l))
  })
  for (const l of shared()) void syncList(l)
}
