// Cloud-Abgleich zwischen PCs – reine Logik ohne Ein-/Ausgabe (testbar).
//
// Jedes Gerät schreibt seinen kompletten Stand als eigene Datei in den OneDrive-App-Ordner
// (devices/<geräte-id>.json). So überschreiben sich Geräte nie gegenseitig, und OneDrive
// erzeugt keine Konfliktkopien. Beim Abgleich gewinnt je Eintrag die jüngste Änderung;
// Löschungen werden als „Grabstein“ mit Zeitstempel weitergegeben.

import type { AppData, CloudCollection, CloudPatch, FollowUp, ReplyMark, Settings, SuggestionState } from './types'

export const CLOUD_COLLECTIONS: CloudCollection[] = ['tasks', 'notes', 'projects', 'docs', 'events', 'focusLog']
export type CloudGroup = CloudCollection | 'replyMarks' | 'suggestions' | 'followUps' | 'reviewQueue' | 'settings'
export const CLOUD_GROUPS: CloudGroup[] = [...CLOUD_COLLECTIONS, 'replyMarks', 'suggestions', 'followUps', 'reviewQueue', 'settings']
const MAP_GROUPS = new Set<CloudGroup>(['replyMarks', 'suggestions', 'followUps', 'reviewQueue', 'settings'])

/** Einstellungen, die auf allen PCs gleich sein sollen (Gerätespezifisches wie Autostart bleibt lokal). */
export const SYNCED_SETTINGS: (keyof Settings)[] = [
  'userName',
  'theme',
  'accent',
  'motion',
  'sidebarCollapsed',
  'sidebarMode',
  'notifications',
  'sidebar',
  'dashboardCards',
  'workHours',
  'focusMinMinutes',
  'transitionBufferMinutes',
  'retention',
  'weather',
  'focus',
  'gmailHiddenCategories',
  'mailInsights',
  'mailRules'
]

/** Grabsteine nach 90 Tagen vergessen */
const TOMBSTONE_MS = 90 * 24 * 3600_000

export interface CloudRec {
  t: number
  /** gelöscht */
  d?: 1
  v?: unknown
}
export type Records = Partial<Record<CloudGroup, Record<string, CloudRec>>>
export interface DeviceDoc {
  v: 1
  id: string
  name: string
  at: string
  recs: Records
}
export interface SyncBook {
  /** Prüfsumme je Eintrag beim letzten Stand – erkennt lokale Änderungen */
  snap: Partial<Record<CloudGroup, Record<string, string>>>
  /** Zeitstempel je Eintrag (auch gelöschte) */
  meta: Partial<Record<CloudGroup, Record<string, { t: number; d?: 1 }>>>
}

const isDemo = (id: string) => id.startsWith('demo-')

/** Was abgeglichen wird: eigene Inhalte – keine Demo-Daten und nichts, was aus Google/Outlook/iCloud kommt. */
export function extractRecords(data: AppData, settings: Settings): Record<CloudGroup, Record<string, unknown>> {
  const by = <T extends { id: string }>(list: T[] | undefined, keep: (x: T) => boolean) => {
    const o: Record<string, unknown> = {}
    for (const x of list ?? []) if (x && typeof x.id === 'string' && !isDemo(x.id) && keep(x)) o[x.id] = x
    return o
  }
  const s: Record<string, unknown> = {}
  for (const k of SYNCED_SETTINGS) if (settings[k] !== undefined) s[k] = settings[k]
  return {
    tasks: by(data.tasks, (t) => t.source !== 'demo'),
    notes: by(data.notes, () => true),
    projects: by(data.projects, () => true),
    docs: by(data.docs, (d) => d.source !== 'demo'),
    events: by(data.events, (e) => e.source === 'local' && !e.readOnly),
    focusLog: by(data.focusLog, () => true),
    replyMarks: { ...(data.replyMarks ?? {}) },
    suggestions: { ...(data.suggestions ?? {}) },
    followUps: { ...(data.followUps ?? {}) },
    reviewQueue: { ...(data.reviewQueue ?? {}) },
    settings: s
  }
}

/** Stabile Prüfsumme (FNV-1a über JSON) */
export function hashValue(v: unknown): string {
  const str = JSON.stringify(v) ?? ''
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 16777619)
    h2 = Math.imul(h2 ^ c, 2246822519)
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + str.length.toString(36)
}

/** Lokale Änderungen seit dem letzten Stand mit Zeitstempel versehen. Gibt true zurück, wenn sich etwas geändert hat. */
/**
 * baseline: erster Abgleich dieses PCs (neu verbunden oder nach dem Trennen). Vorhandenes gilt dann als „alt“ –
 * sonst würde ein wieder verbundener PC neuere Änderungen der anderen PCs überschreiben.
 */
export function trackChanges(book: SyncBook, cur: Record<CloudGroup, Record<string, unknown>>, now: number, defaults?: Partial<Settings>, baseline = false): boolean {
  let changed = false
  for (const g of CLOUD_GROUPS) {
    const snap = (book.snap[g] ??= {})
    const meta = (book.meta[g] ??= {})
    const vals = cur[g] ?? {}
    for (const [id, v] of Object.entries(vals)) {
      const h = hashValue(v)
      if (snap[id] !== h) {
        snap[id] = h
        // Eine noch nie angefasste Standard-Einstellung (frisch installierter PC) ist „uralt“ –
        // sonst würde sie die Einstellungen der anderen PCs überschreiben.
        const untouchedDefault = !meta[id] && g === 'settings' && !!defaults && h === hashValue(defaults[id as keyof Settings])
        meta[id] = { t: untouchedDefault ? 1 : baseline && !meta[id] ? 2 : Math.max(now, (meta[id]?.t ?? 0) + 1) }
        changed = true
      }
    }
    for (const id of Object.keys(snap)) {
      if (!(id in vals)) {
        delete snap[id]
        meta[id] = { t: Math.max(now, (meta[id]?.t ?? 0) + 1), d: 1 }
        changed = true
      }
    }
  }
  return changed
}

export interface MergeResult {
  patch: CloudPatch
  settings: Partial<Settings> | null
  changed: boolean
}

const str = (v: unknown) => typeof v === 'string'
/** Pflichtfelder je Sammlung – beschädigte oder fremde Einträge werden verworfen statt die App zu stören */
const REQUIRED: Record<CloudCollection, string[]> = {
  tasks: ['title', 'status', 'priority', 'createdAt'],
  events: ['title', 'start', 'end'],
  notes: ['title', 'body', 'createdAt'],
  projects: ['name'],
  docs: ['title'],
  focusLog: ['start', 'end']
}

/** Ist der Wert eines anderen Geräts plausibel? */
export function validRecord(g: CloudGroup, id: string, v: unknown, defaults?: Partial<Settings>): boolean {
  if (v === null || typeof v !== 'object') return g === 'settings' ? !defaults || sameType(v, defaults[id as keyof Settings]) : false
  if (g === 'settings') return !defaults || sameType(v, defaults[id as keyof Settings])
  if (MAP_GROUPS.has(g)) return !Array.isArray(v)
  const o = v as Record<string, unknown>
  if (o.id !== id) return false
  return REQUIRED[g as CloudCollection].every((k) => str(o[k])) && (g !== 'events' || !Number.isNaN(new Date(o.start as string).getTime()))
}
function sameType(a: unknown, b: unknown): boolean {
  if (b === undefined) return a === undefined || ['string', 'number', 'boolean'].includes(typeof a)
  if (Array.isArray(b)) return Array.isArray(a)
  if (b === null) return a === null
  return typeof a === typeof b && Array.isArray(a) === Array.isArray(b)
}

/** Stände anderer Geräte einarbeiten: je Eintrag gewinnt die jüngere Änderung. */
export function mergeRemote(book: SyncBook, docs: DeviceDoc[], defaults?: Partial<Settings>): MergeResult {
  const patch: CloudPatch = { upsert: {}, remove: {} }
  const settings: Partial<Settings> = {}
  const marks = { set: {} as Record<string, ReplyMark>, remove: [] as string[] }
  const sugg = { set: {} as Record<string, SuggestionState>, remove: [] as string[] }
  const fups = { set: {} as Record<string, FollowUp>, remove: [] as string[] }
  const rq = { set: {} as Record<string, { at: string }>, remove: [] as string[] }
  let changed = false
  let settingsChanged = false
  for (const doc of docs) {
    for (const g of CLOUD_GROUPS) {
      const recs = doc.recs?.[g]
      if (!recs) continue
      const snap = (book.snap[g] ??= {})
      const meta = (book.meta[g] ??= {})
      for (const [id, r] of Object.entries(recs)) {
        if (!r || typeof r.t !== 'number' || !Number.isFinite(r.t) || r.t > Date.now() + 7 * 86400_000) continue
        if (!r.d && !validRecord(g, id, r.v, defaults)) continue
        if (!MAP_GROUPS.has(g) && isDemo(id)) continue
        if (g === 'settings' && !SYNCED_SETTINGS.includes(id as keyof Settings)) continue
        const local = meta[id]
        if (local && local.t >= r.t) continue
        const present = id in snap
        meta[id] = r.d ? { t: r.t, d: 1 } : { t: r.t }
        if (r.d) {
          if (!present) continue
          delete snap[id]
          if (g === 'settings') continue
          if (g === 'replyMarks') marks.remove.push(id)
          else if (g === 'suggestions') sugg.remove.push(id)
          else if (g === 'followUps') fups.remove.push(id)
          else if (g === 'reviewQueue') rq.remove.push(id)
          else (patch.remove[g] ??= []).push(id)
          changed = true
        } else {
          if (r.v === undefined) continue
          const h = hashValue(r.v)
          if (snap[id] === h) continue
          snap[id] = h
          if (g === 'settings') {
            ;(settings as Record<string, unknown>)[id] = r.v
            settingsChanged = true
          } else if (g === 'replyMarks') marks.set[id] = r.v as ReplyMark
          else if (g === 'suggestions') sugg.set[id] = r.v as SuggestionState
          else if (g === 'followUps') fups.set[id] = r.v as FollowUp
          else if (g === 'reviewQueue') rq.set[id] = r.v as { at: string }
          else {
            const list = (patch.upsert[g] ??= [])
            const i = list.findIndex((x) => x.id === id)
            if (i >= 0) list[i] = r.v as { id: string }
            else list.push(r.v as { id: string })
            // Ein Eintrag, der von einem älteren Dokument gelöscht wurde, ist wieder da
            const rm = patch.remove[g]
            if (rm) patch.remove[g] = rm.filter((x) => x !== id)
          }
          changed = true
        }
      }
    }
  }
  if (Object.keys(marks.set).length || marks.remove.length) patch.replyMarks = marks
  if (Object.keys(sugg.set).length || sugg.remove.length) patch.suggestions = sugg
  if (Object.keys(fups.set).length || fups.remove.length) patch.followUps = fups
  if (Object.keys(rq.set).length || rq.remove.length) patch.reviewQueue = rq
  return { patch, settings: settingsChanged ? settings : null, changed: changed || settingsChanged }
}

/** Eigenes Gerätedokument für den Upload. Alte Grabsteine werden dabei aufgeräumt. */
export function buildDoc(book: SyncBook, cur: Record<CloudGroup, Record<string, unknown>>, id: string, name: string, now: number): DeviceDoc {
  const recs: Records = {}
  for (const g of CLOUD_GROUPS) {
    const meta = book.meta[g] ?? {}
    const out: Record<string, CloudRec> = {}
    for (const [k, m] of Object.entries(meta)) {
      if (m.d) {
        if (now - m.t > TOMBSTONE_MS) {
          delete meta[k]
          continue
        }
        out[k] = { t: m.t, d: 1 }
      } else if (cur[g] && k in cur[g]) out[k] = { t: m.t, v: cur[g][k] }
    }
    if (Object.keys(out).length) recs[g] = out
  }
  return { v: 1, id, name, at: new Date(now).toISOString(), recs }
}

/** Änderungen eines anderen Geräts auf den aktuellen Datenstand anwenden (Haupt- und Oberflächenprozess). */
export function applyCloudPatch(d: AppData, p: CloudPatch): AppData {
  let next = d
  for (const c of CLOUD_COLLECTIONS) {
    const up = p.upsert[c] ?? []
    const rm = new Set(p.remove[c] ?? [])
    if (!up.length && !rm.size) continue
    const list = ((d[c] as { id: string }[] | undefined) ?? []) as { id: string }[]
    const byId = new Map(up.map((x) => [x.id, x]))
    const existing = new Set(list.map((x) => x.id))
    const kept = list.filter((x) => !rm.has(x.id)).map((x) => byId.get(x.id) ?? x)
    const added = up.filter((x) => !existing.has(x.id) && !rm.has(x.id))
    next = { ...next, [c]: c === 'focusLog' ? [...kept, ...added] : [...added, ...kept] }
  }
  if (p.replyMarks) {
    const m = { ...(d.replyMarks ?? {}) }
    for (const k of p.replyMarks.remove) delete m[k]
    Object.assign(m, p.replyMarks.set)
    next = { ...next, replyMarks: m }
  }
  if (p.suggestions) {
    const m = { ...(d.suggestions ?? {}) }
    for (const k of p.suggestions.remove) delete m[k]
    Object.assign(m, p.suggestions.set)
    next = { ...next, suggestions: m }
  }
  if (p.followUps) {
    const m = { ...(d.followUps ?? {}) }
    for (const k of p.followUps.remove) delete m[k]
    Object.assign(m, p.followUps.set)
    next = { ...next, followUps: m }
  }
  if (p.reviewQueue) {
    const m = { ...(d.reviewQueue ?? {}) }
    for (const k of p.reviewQueue.remove) delete m[k]
    Object.assign(m, p.reviewQueue.set)
    next = { ...next, reviewQueue: m }
  }
  return next
}
