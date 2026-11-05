// Geteilte Einkaufsliste: Beitrittscode, Einladungslink und der Abgleich mit der gemeinsamen Datei.
// Die Datei liegt im OneDrive der Person, die geteilt hat; Zugriff haben nur eingeladene Microsoft-Konten.
// Schreiben nur mit passendem ETag – hat jemand dazwischen geschrieben, wird neu gelesen und zusammengeführt.
import { markSynced, mergeItems, purgeTombstones, type MergeConflict } from './shopping.ts'
import type { SharedListDoc, ShoppingItem, ShoppingShare } from './types.ts'

const b64url = (s: string) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}
const unb64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

/** Code zum Weitergeben an eingeladene Personen (enthält keine Zugangsdaten – ohne Einladung nutzlos) */
export const joinCode = (s: Pick<ShoppingShare, 'driveId' | 'itemId' | 'role'>) => `TW1-${b64url(`${s.driveId}|${s.itemId}`)}`

const ONEDRIVE_LINK = /^https:\/\/(1drv\.ms|onedrive\.live\.com|([a-z0-9-]+\.)?sharepoint\.com|([a-z0-9-]+-my\.)?sharepoint\.com)\//i

export type JoinTarget = { kind: 'code'; driveId: string; itemId: string } | { kind: 'link'; url: string }

/** Beitrittscode oder Link aus der Einladungs-Mail erkennen. Andere Adressen werden abgelehnt. */
export function parseJoin(input: string): JoinTarget | null {
  const t = input.trim()
  const code = t.match(/^TW1-([A-Za-z0-9_-]+)$/)
  if (code) {
    try {
      const [driveId, itemId] = unb64url(code[1]).split('|')
      if (driveId && itemId) return { kind: 'code', driveId, itemId }
    } catch {
      return null
    }
    return null
  }
  if (ONEDRIVE_LINK.test(t) && !/\s/.test(t)) return { kind: 'link', url: t }
  return null
}

/** Freigabe-Link für /shares/{id} (Microsoft Graph) */
export const encodeShareUrl = (url: string) => `u!${b64url(url)}`

export interface SharedIo {
  /** null = Datei gibt es (noch) nicht */
  read(): Promise<{ doc: SharedListDoc; etag: string } | null>
  /** ifMatch undefined = neu anlegen */
  write(doc: SharedListDoc, ifMatch?: string): Promise<{ ok: true; etag: string } | { ok: false; conflict: true }>
}

export type SharedSyncOutcome =
  | { ok: true; wrote: boolean; value: { items: ShoppingItem[]; name: string; etag: string; conflicts: MergeConflict[] } }
  | { ok: false; error: string }

const validItem = (id: string, v: unknown): v is ShoppingItem => {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return o.id === id && typeof o.name === 'string' && typeof o.listId === 'string' && typeof o.category === 'string' && typeof o.done === 'boolean' && !!o.stamps && typeof o.stamps === 'object' && typeof o.createdAt === 'string'
}
export function readDoc(raw: unknown): SharedListDoc | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Partial<SharedListDoc>
  if (d.v !== 1 || typeof d.name !== 'string' || !d.items || typeof d.items !== 'object') return null
  const items: Record<string, ShoppingItem> = {}
  for (const [id, v] of Object.entries(d.items)) if (validItem(id, v)) items[id] = v
  return { v: 1, name: d.name, items }
}

const same = (a: ShoppingItem[], b: ShoppingItem[]) => {
  if (a.length !== b.length) return false
  const m = new Map(a.map((i) => [i.id, JSON.stringify({ ...i, syncedAt: 0 })]))
  return b.every((i) => m.get(i.id) === JSON.stringify({ ...i, syncedAt: 0 }))
}

/** Lokale Einträge mit der gemeinsamen Datei abgleichen. Bis zu 4 Versuche bei gleichzeitigen Schreibern. */
export async function runSharedSync(io: SharedIo, local: ShoppingItem[], name: string, now: number): Promise<SharedSyncOutcome> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await io.read()
    const doc = cur ? readDoc(cur.doc) : null
    if (cur && !doc) return { ok: false, error: 'Die gemeinsame Liste in OneDrive ist beschädigt oder stammt aus einer neueren Tagwerk-Version.' }
    const remote = doc ? Object.values(doc.items) : []
    const merged = mergeItems(local, remote)
    // Alles, was jetzt in der Datei steht bzw. stehen wird, gilt als abgeglichen
    const items = markSynced(purgeTombstones(merged.items, now))
    const listName = doc?.name ?? name
    if (doc && same(items, remote)) return { ok: true, wrote: false, value: { items, name: listName, etag: cur!.etag, conflicts: merged.conflicts } }
    const next: SharedListDoc = { v: 1, name: listName, items: Object.fromEntries(items.map((i) => [i.id, i])) }
    const w = await io.write(next, cur?.etag)
    if (w.ok) return { ok: true, wrote: true, value: { items, name: listName, etag: w.etag, conflicts: merged.conflicts } }
  }
  return { ok: false, error: 'Mehrere Personen haben gleichzeitig geändert. Tagwerk versucht es gleich noch einmal – deine Änderungen bleiben erhalten.' }
}
