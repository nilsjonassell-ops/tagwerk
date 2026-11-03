// Cloud-Abgleich über den OneDrive-App-Ordner (Apps/Tagwerk) des Microsoft-Kontos.
// Kostenlos (zählt nur zum OneDrive-Speicher), kein eigener Server. Die Logik steckt in
// shared/cloud.ts; hier passiert nur Laden, Hochladen und das Anwenden auf die lokalen Daten.

import { app } from 'electron'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type CloudDevice, type CloudPatch, type CloudStatus, type Settings } from '@shared/types'
import { applyCloudPatch, buildDoc, extractRecords, hashValue, mergeRemote, trackChanges, type DeviceDoc, type SyncBook } from '@shared/cloud'
import { store } from './store'
import { driveFetch, msCaps, msErrorText } from './microsoft'
import { log } from './log'

interface CloudState extends SyncBook {
  deviceId: string
  enabled: boolean
  /** eTag je Gerätedatei – unveränderte Dateien werden nicht erneut geladen */
  etags: Record<string, string>
  uploaded?: string
  lastSync?: string
  devices: Record<string, { name: string; at: string }>
}

// Nur in Entwicklungs-Builds für Tests verkürzbar
const POLL_MS = !app.isPackaged && Number(process.env.TAGWERK_CLOUD_POLL_MS) > 0 ? Number(process.env.TAGWERK_CLOUD_POLL_MS) : 30_000
const DEBOUNCE_MS = 3_000
const DIR = '/me/drive/special/approot:/devices'

let st: CloudState | null = null
let running = false
let again = false
let lastError: string | undefined
let debounce: ReturnType<typeof setTimeout> | null = null
let timer: ReturnType<typeof setInterval> | null = null
/** Nach einem eingespielten Stand warten, bis die Oberfläche ihn übernommen hat */
let awaitingAck: ReturnType<typeof setTimeout> | null = null
let hooks: { patch: (p: CloudPatch) => void; settings: (s: Settings) => void; status: (s: CloudStatus) => void } | null = null

const file = () => join(store.dir(), 'cloud-state.json')
const deviceName = () => (!app.isPackaged && process.env.TAGWERK_DEVICE_NAME) || hostname() || 'Dieser PC'

function load(): CloudState {
  if (st) return st
  try {
    if (existsSync(file())) st = JSON.parse(readFileSync(file(), 'utf8')) as CloudState
  } catch {
    st = null
  }
  st ??= { deviceId: randomUUID(), enabled: true, snap: {}, meta: {}, etags: {}, devices: {} }
  st.snap ??= {}
  st.meta ??= {}
  st.etags ??= {}
  st.devices ??= {}
  return st
}
function save() {
  if (!st) return
  const tmp = `${file()}.tmp`
  writeFileSync(tmp, JSON.stringify(st), 'utf8')
  renameSync(tmp, file())
}

const available = () => msCaps().sync

export function cloudStatus(): CloudStatus {
  const s = load()
  const devices: CloudDevice[] = Object.entries(s.devices)
    .map(([id, d]) => ({ id, name: d.name, lastSeen: d.at, self: id === s.deviceId }))
    .sort((a, b) => Number(b.self) - Number(a.self) || b.lastSeen.localeCompare(a.lastSeen))
  if (!devices.some((d) => d.self) && s.lastSync) devices.unshift({ id: s.deviceId, name: deviceName(), lastSeen: s.lastSync, self: true })
  return { available: available(), enabled: s.enabled, syncing: running, lastSync: s.lastSync, error: lastError, devices, deviceName: deviceName() }
}

const current = () => {
  const data = store.loadData()
  return data ? extractRecords(data, store.getSettings()) : null
}

/** Lokale Änderung gespeichert → kurz danach abgleichen */
function onLocalChange() {
  const s = load()
  if (!s.enabled || !available() || awaitingAck) return
  const cur = current()
  if (cur && trackChanges(s, cur, Date.now(), DEFAULT_SETTINGS, !s.lastSync)) save()
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => void syncNow(), DEBOUNCE_MS)
}

async function listRemote(): Promise<{ name: string; eTag: string }[]> {
  const res = await driveFetch(`${DIR}:/children?$select=name,eTag&$top=200`)
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`Liste (${res.status})`)
  const j = (await res.json()) as { value?: { name: string; eTag: string }[] }
  return (j.value ?? []).filter((f) => /\.json$/i.test(f.name))
}

async function download(name: string): Promise<DeviceDoc | null> {
  const res = await driveFetch(`${DIR}/${encodeURIComponent(name)}:/content`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Laden (${res.status})`)
  const doc = (await res.json().catch(() => null)) as DeviceDoc | null
  return doc && doc.v === 1 && typeof doc.id === 'string' && doc.recs ? doc : null
}

async function upload(doc: DeviceDoc): Promise<string | undefined> {
  const res = await driveFetch(`${DIR}/${doc.id}.json:/content`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(doc) })
  if (!res.ok) throw new Error(`Hochladen (${res.status})`)
  const j = (await res.json().catch(() => ({}))) as { eTag?: string }
  return j.eTag
}

export async function syncNow(): Promise<CloudStatus> {
  const s = load()
  if (!s.enabled || !available()) return cloudStatus()
  if (running) {
    again = true
    return cloudStatus()
  }
  running = true
  hooks?.status(cloudStatus())
  try {
    const cur0 = current()
    if (!cur0) return cloudStatus()
    if (!awaitingAck && trackChanges(s, cur0, Date.now(), DEFAULT_SETTINGS, !s.lastSync)) save()

    // 1. Stände der anderen PCs holen (nur geänderte Dateien)
    const files = await listRemote()
    const mine = `${s.deviceId}.json`
    const docs: DeviceDoc[] = []
    for (const f of files) {
      if (f.name === mine || s.etags[f.name] === f.eTag) continue
      const doc = await download(f.name)
      if (doc && doc.id !== s.deviceId) {
        docs.push(doc)
        s.devices[doc.id] = { name: String(doc.name || 'PC').slice(0, 60), at: doc.at }
      }
      s.etags[f.name] = f.eTag
    }

    // 2. Einarbeiten
    if (docs.length) {
      const { patch, settings, changed } = mergeRemote(s, docs, DEFAULT_SETTINGS)
      if (changed) {
        const data = store.loadData()
        const hasPatch = Object.keys(patch.upsert).length || Object.keys(patch.remove).length || patch.replyMarks || patch.suggestions || patch.followUps || patch.reviewQueue
        if (data && hasPatch) {
          // Die Oberfläche übernimmt den Stand auf ihre aktuellen Daten; bis dahin keine lokalen Änderungen werten
          if (awaitingAck) clearTimeout(awaitingAck)
          awaitingAck = setTimeout(() => (awaitingAck = null), 10_000)
          store.saveData(applyCloudPatch(data, patch))
          hooks?.patch(patch)
        }
        if (settings) hooks?.settings(store.setSettings(settings))
        log.info('cloud merged', { devices: docs.length })
      }
    }
    save()

    // 3. Eigenen Stand hochladen, wenn er sich geändert hat
    const cur = current()
    if (cur) {
      const doc = buildDoc(s, cur, s.deviceId, deviceName(), Date.now())
      const h = hashValue(doc.recs)
      if (h !== s.uploaded) {
        const etag = await upload(doc)
        s.uploaded = h
        if (etag) s.etags[mine] = etag
      }
    }
    s.lastSync = new Date().toISOString()
    s.devices[s.deviceId] = { name: deviceName(), at: s.lastSync }
    lastError = undefined
    save()
  } catch (e) {
    lastError = e instanceof Error && /^(Liste|Laden|Hochladen)/.test(e.message) ? `OneDrive-Abgleich fehlgeschlagen (${e.message}).` : msErrorText(e)
    log.warn('cloud sync failed', { msg: lastError.slice(0, 80) })
  } finally {
    running = false
    hooks?.status(cloudStatus())
    if (again) {
      again = false
      setTimeout(() => void syncNow(), 500)
    }
  }
  return cloudStatus()
}

/** Die Oberfläche hat den eingespielten Stand übernommen */
export function cloudAck() {
  if (awaitingAck) clearTimeout(awaitingAck)
  awaitingAck = null
}

export async function setCloudEnabled(on: boolean): Promise<CloudStatus> {
  const s = load()
  s.enabled = on
  save()
  if (on) return syncNow()
  return cloudStatus()
}

/** Beim Trennen von Microsoft: Abgleichsstand vergessen, damit ein anderes Konto sauber startet */
export function resetCloud() {
  const s = load()
  st = { deviceId: s.deviceId, enabled: s.enabled, snap: {}, meta: {}, etags: {}, devices: {} }
  lastError = undefined
  save()
}

export function initCloud(h: NonNullable<typeof hooks>) {
  hooks = h
  store.onChange(onLocalChange)
  timer ??= setInterval(() => void syncNow(), POLL_MS)
  setTimeout(() => void syncNow(), 4_000)
}
