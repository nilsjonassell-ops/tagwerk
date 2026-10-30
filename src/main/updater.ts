// Automatische Updates über GitHub Releases (nur in der installierten App).
// Ablauf: im Hintergrund prüfen und laden → Hinweis in der App →
// Neustart erst, wenn du auf „Jetzt neu starten“ klickst (sonst beim Beenden).

import { app, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '@shared/types'
import { log } from './log'

let status: UpdateStatus = { state: 'idle', current: app.getVersion() }
let getWindow: () => BrowserWindow | null = () => null
let timer: NodeJS.Timeout | null = null

function emit(next: Partial<UpdateStatus>) {
  status = { ...status, ...next, current: app.getVersion() }
  const win = getWindow()
  if (win && !win.isDestroyed()) win.webContents.send('update:status', status)
}

export function updateStatus(): UpdateStatus {
  return status
}

export function initUpdater(window: () => BrowserWindow | null) {
  getWindow = window
  if (!app.isPackaged) {
    status = { state: 'dev', current: app.getVersion() }
    return
  }
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null
  autoUpdater.on('checking-for-update', () => emit({ state: 'checking', error: undefined }))
  autoUpdater.on('update-available', (i) => emit({ state: 'downloading', version: i.version, percent: 0 }))
  autoUpdater.on('update-not-available', () => emit({ state: 'current', checkedAt: Date.now() }))
  autoUpdater.on('download-progress', (p) => emit({ state: 'downloading', percent: Math.round(p.percent) }))
  autoUpdater.on('update-downloaded', (i) => {
    log.info('update downloaded', { version: i.version })
    emit({ state: 'ready', version: i.version })
  })
  autoUpdater.on('error', (err) => {
    log.warn('update failed', { name: err?.name })
    emit({ state: 'error', error: 'Updates konnten nicht geprüft werden. Später erneut versuchen.' })
  })
  setTimeout(() => void check(), 15_000)
  timer = setInterval(() => void check(), 4 * 3600_000)
}

export async function check(): Promise<UpdateStatus> {
  if (!app.isPackaged) return status
  if (status.state === 'downloading' || status.state === 'ready') return status
  try {
    await autoUpdater.checkForUpdates()
  } catch {
    /* Fehler kommt über das error-Ereignis */
  }
  return status
}

export function installNow() {
  if (status.state !== 'ready') return
  if (timer) clearInterval(timer)
  // still installieren und danach sofort neu starten
  autoUpdater.quitAndInstall(true, true)
}
