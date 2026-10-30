// Lokale Ablage: Daten und Einstellungen als JSON im Benutzerordner der App.
// Schreibvorgänge sind atomar (temporäre Datei + Umbenennen).

import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type AppData, type Settings } from '@shared/types'
import { log } from './log'

const dir = () => {
  const d = join(app.getPath('userData'), 'data')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}
const dataFile = () => join(dir(), 'tagwerk-data.json')
const settingsFile = () => join(dir(), 'settings.json')

function readJson<T>(file: string): T | null {
  try {
    if (!existsSync(file)) return null
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch (err) {
    // Inhalt wird bewusst nicht geloggt.
    log.warn('Datei konnte nicht gelesen werden', { file: file.split(/[\\/]/).pop(), err: (err as Error).name })
    return null
  }
}

function writeJsonAtomic(file: string, value: unknown) {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(value), 'utf8')
  renameSync(tmp, file)
}

let cachedData: AppData | null = null
let cachedSettings: Settings | null = null

export const store = {
  loadData(): AppData | null {
    if (!cachedData) cachedData = readJson<AppData>(dataFile())
    return cachedData
  },
  saveData(data: AppData) {
    if (!data || data.version !== 1 || !Array.isArray(data.tasks)) throw new Error('Ungültiges Datenformat')
    cachedData = data
    writeJsonAtomic(dataFile(), data)
  },
  getSettings(): Settings {
    if (!cachedSettings) {
      const raw = readJson<Partial<Settings>>(settingsFile()) ?? {}
      cachedSettings = mergeSettings(raw)
    }
    return cachedSettings
  },
  setSettings(patch: Partial<Settings>): Settings {
    const next = mergeSettings({ ...this.getSettings(), ...patch })
    cachedSettings = next
    writeJsonAtomic(settingsFile(), next)
    return next
  },
  wipe() {
    cachedData = null
    cachedSettings = null
    rmSync(dir(), { recursive: true, force: true })
  },
  dataPath: () => dataFile()
}

function mergeSettings(raw: Partial<Settings>): Settings {
  const d = DEFAULT_SETTINGS
  const s: Settings = {
    ...d,
    ...raw,
    notifications: { ...d.notifications, ...raw.notifications, quiet: { ...d.notifications.quiet, ...raw.notifications?.quiet } },
    workHours: { ...d.workHours, ...raw.workHours },
    claude: { ...d.claude, ...raw.claude },
    retention: { ...d.retention, ...raw.retention },
    weather: { ...d.weather, ...raw.weather },
    focus: { ...d.focus, ...raw.focus }
  }
  // Neue Ansichten/Karten aus Updates ergänzen, ohne die Nutzerreihenfolge zu verlieren.
  if (!Array.isArray(s.gmailHiddenCategories)) s.gmailHiddenCategories = [...d.gmailHiddenCategories]
  s.sidebar = completeList(raw.sidebar, d.sidebar)
  s.dashboardCards = completeList(raw.dashboardCards, d.dashboardCards)
  return s
}

function completeList<T extends { id: string }>(user: T[] | undefined, defaults: T[]): T[] {
  if (!Array.isArray(user)) return defaults.map((x) => ({ ...x }))
  const known = new Set(defaults.map((x) => x.id))
  const kept = user.filter((x) => known.has(x.id))
  for (const def of defaults) if (!kept.some((x) => x.id === def.id)) kept.push({ ...def })
  return kept
}
