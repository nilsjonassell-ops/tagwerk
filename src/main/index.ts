import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  Notification,
  screen,
  session,
  shell,
  Tray
} from 'electron'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { uptime } from 'node:os'
import { randomUUID } from 'node:crypto'
import { eventsOnDay, hm } from '@shared/analysis'
import type { OneNoteSaveRequest, AppData, CalEvent, ClaudeRequest, GoogleConnectOptions, GoogleSendParams, Note, Settings, FocusSignal, NotifyRequest } from '@shared/types'
import { store } from './store'
import { secrets } from './secrets'
import { sendToClaude, verifyKey } from './claude'
import { parseIcs } from './ics'
import { getWeather } from './weather'
import { check as checkUpdate, initUpdater, installNow, updateStatus } from './updater'
import { handlePopupAction, initNotify, notify } from './notify'
import { initPopup } from './popup'
import { focusState, focusSummary, initFocus, setFocus } from './focus'
import { startScheduler } from './scheduler'
import * as google from './google'
import * as microsoft from './microsoft'
import { log } from './log'

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'
const devUrl = process.env['ELECTRON_RENDERER_URL']

let mainWindow: BrowserWindow | null = null
let quickWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let hintedTray = false

app.setName('Tagwerk')
// Aus dem Microsoft Store: Windows vergibt die App-Kennung selbst (Taskleiste, Mitteilungen)
const isStore = !!process.windowsStore
if (isWin && !isStore) app.setAppUserModelId('de.nilssell.tagwerk')

// Startprotokoll (nur Ereignisse, keine Inhalte) – hilft bei Startproblemen.
function trace(msg: string) {
  try {
    appendFileSync(join(app.getPath('userData'), 'start.log'), `${new Date().toISOString()} [${process.pid}] ${msg}\n`)
  } catch {
    /* egal */
  }
}

// Nach einem Update startet der Installer die App neu, während die alte Instanz
// gerade noch beendet wird – dann kurz warten und die Sperre erneut versuchen.
const justUpdated = process.argv.includes('--updated')
const gotLock = app.requestSingleInstanceLock()
trace(`start lock=${gotLock} updated=${justUpdated}`)
if (!gotLock && justUpdated) {
  let tries = 0
  const retry = () => {
    if (app.requestSingleInstanceLock()) {
      trace('lock after update')
      startApp()
    } else if (++tries < 20) setTimeout(retry, 500)
    else app.quit()
  }
  setTimeout(retry, 500)
} else if (!gotLock) {
  app.quit()
} else {
  startApp()
}

function startApp() {
  app.on('second-instance', () => {
    trace(`second-instance window=${mainWindow ? (mainWindow.isDestroyed() ? 'destroyed' : mainWindow.isVisible() ? 'visible' : 'hidden') : 'none'}`)
    showMain()
  })
  app.whenReady().then(init)
}

function resource(name: string) {
  const base = app.isPackaged ? join(process.resourcesPath, 'resources') : join(__dirname, '../../resources')
  return join(base, name)
}

// ---------- Fenster ----------

const windowStateFile = () => join(app.getPath('userData'), 'window.json')

function loadBounds() {
  try {
    if (!existsSync(windowStateFile())) return null
    const b = JSON.parse(readFileSync(windowStateFile(), 'utf8')) as Electron.Rectangle & { maximized?: boolean }
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea
      return b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y
    })
    return visible ? b : null
  } catch {
    return null
  }
}

function saveBounds() {
  if (!mainWindow) return
  try {
    writeFileSync(windowStateFile(), JSON.stringify({ ...mainWindow.getNormalBounds(), maximized: mainWindow.isMaximized() }))
  } catch {
    /* ignorieren */
  }
}

function overlayColors() {
  const dark = nativeTheme.shouldUseDarkColors
  // Transparent, damit der Glas-Hintergrund bis in die Titelleiste reicht.
  return dark ? { color: '#00000000', symbolColor: '#e6e8ff', height: 44 } : { color: '#00000000', symbolColor: '#2a2f55', height: 44 }
}

function createMainWindow(startHidden: boolean) {
  const b = loadBounds()
  mainWindow = new BrowserWindow({
    width: b?.width ?? 1320,
    height: b?.height ?? 860,
    x: b?.x,
    y: b?.y,
    minWidth: 760,
    minHeight: 540,
    show: false,
    title: 'Tagwerk',
    icon: resource('icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#090b1a' : '#eef1fb',
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: isMac ? { x: 16, y: 15 } : undefined,
    titleBarOverlay: isMac ? undefined : overlayColors(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true
    }
  })
  if (b?.maximized) mainWindow.maximize()

  mainWindow.once('ready-to-show', () => {
    if (!startHidden) mainWindow?.show()
  })
  mainWindow.on('close', (e) => {
    trace(`close quitting=${quitting} tray=${!!tray}`)
    saveBounds()
    if (!quitting && store.getSettings().closeToTray && tray) {
      e.preventDefault()
      hideToTray()
      if (!hintedTray && Notification.isSupported()) {
        hintedTray = true
        new Notification({
          title: 'Tagwerk läuft weiter',
          body: isMac ? 'Über das Symbol in der Menüleiste kommst du jederzeit zurück.' : 'Über das Symbol im Infobereich kommst du jederzeit zurück.'
        }).show()
      }
    }
  })
  mainWindow.on('closed', () => (mainWindow = null))
  hardenContents(mainWindow.webContents)
  load(mainWindow, '')
}

function load(win: BrowserWindow, hash: string) {
  if (devUrl) win.loadURL(`${devUrl}${hash ? `#${hash}` : ''}`)
  else win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
}

function hardenContents(wc: Electron.WebContents) {
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  wc.on('will-navigate', (e, url) => {
    if (devUrl && url.startsWith(devUrl)) return
    e.preventDefault()
  })
}

function showMain(view?: string) {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow(false)
  if (!mainWindow) return
  const win = mainWindow
  // War das Fenster im Infobereich versteckt, spielt die Startanimation erneut –
  // kurz vorher anstoßen, damit kein alter Zustand aufblitzt.
  if (!win.isVisible() && !win.webContents.isLoading()) win.webContents.send('app:command', 'replay-intro')
  reveal(win, view)
}

/** In den Infobereich: erst das Anfangsbild der Startanimation zeichnen, dann verstecken.
 *  So zeigt Windows beim nächsten Öffnen sofort die Animation statt des alten Dashboards. */
function hideToTray() {
  const win = mainWindow
  if (!win || win.isDestroyed()) return
  win.webContents.send('app:command', 'arm-intro')
  setTimeout(() => !win.isDestroyed() && win.hide(), 140)
}

function reveal(win: BrowserWindow, view?: string) {
  if (win.isDestroyed()) return
  mainWindow = win
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  // Windows verhindert sonst oft, dass ein Hintergrundprozess sein Fenster nach vorn holt.
  if (isWin) {
    mainWindow.setAlwaysOnTop(true)
    mainWindow.focus()
    setTimeout(() => mainWindow?.setAlwaysOnTop(false), 300)
  }
  mainWindow.focus()
  if (view) mainWindow.webContents.send('app:navigate', view)
}

/** Klick auf eine Benachrichtigung: Fenster zeigen und das Ziel öffnen */
function openTarget(t: { view: string; id?: string }) {
  showMain()
  setTimeout(() => mainWindow?.webContents.send('app:open', t), 150)
}

function sendCommand(cmd: string) {
  showMain()
  mainWindow?.webContents.send('app:command', cmd)
}

function openQuickNote() {
  if (quickWindow) {
    quickWindow.show()
    quickWindow.focus()
    return
  }
  const cursor = screen.getCursorScreenPoint()
  const area = screen.getDisplayNearestPoint(cursor).workArea
  const w = 520
  const h = 300
  quickWindow = new BrowserWindow({
    width: w,
    height: h,
    x: Math.round(area.x + (area.width - w) / 2),
    y: Math.round(area.y + area.height * 0.22),
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    transparent: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14172e' : '#f7f8ff',
    roundedCorners: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  hardenContents(quickWindow.webContents)
  load(quickWindow, 'quicknote')
  quickWindow.once('ready-to-show', () => quickWindow?.show())
  quickWindow.on('blur', () => quickWindow?.close())
  quickWindow.on('closed', () => (quickWindow = null))
}

// ---------- Tray ----------

function trayIcon() {
  if (isMac) {
    const img = nativeImage.createFromPath(resource('trayTemplate.png'))
    img.setTemplateImage(true)
    return img
  }
  return nativeImage.createFromPath(resource(nativeTheme.shouldUseDarkColors ? 'tray-light.png' : 'tray-dark.png'))
}

function buildTrayMenu() {
  if (!tray) return
  const data = store.loadData()
  const now = new Date()
  const next = data ? eventsOnDay(data.events, now).find((e) => !e.allDay && new Date(e.start) > now) : undefined
  const openTasks = data ? data.tasks.filter((t) => t.status !== 'done' && !t.archived && t.due && t.due <= now.toISOString().slice(0, 10)).length : 0
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: next ? `Als Nächstes: ${hm(next.start)} ${truncate(next.title, 32)}` : 'Heute keine weiteren Termine', enabled: false },
      { label: openTasks ? `${openTasks} Aufgaben fällig` : 'Keine fälligen Aufgaben', enabled: false },
      { type: 'separator' },
      ...focusTrayItems(),
      { label: 'Tagwerk öffnen', click: () => showMain('today') },
      { label: 'Schnellnotiz', accelerator: store.getSettings().quickNoteShortcut, registerAccelerator: false, click: openQuickNote },
      { label: 'Neue Aufgabe', click: () => sendCommand('new-task') },
      ...(store.getSettings().claude.enabled ? [{ label: 'Claude fragen', click: () => sendCommand('open-assistant') }] : []),
      { type: 'separator' },
      { label: 'Einstellungen', click: () => sendCommand('open-settings') },
      { label: 'Tagwerk beenden', click: () => ((quitting = true), app.quit()) }
    ])
  )
  const fs = focusSummary()
  tray.setToolTip(fs ? `Tagwerk – ${fs}` : next ? `Tagwerk – ${hm(next.start)} ${next.title}` : 'Tagwerk')
}

function focusTrayItems(): Electron.MenuItemConstructorOptions[] {
  const s = focusState()
  const act = (a: string) => () => mainWindow?.webContents.send('focus:action', a)
  if (!s) return [{ label: 'Fokus starten', click: () => sendCommand('focus-start') }, { type: 'separator' }]
  return [
    { label: focusSummary() ?? 'Fokus', enabled: false },
    s.endsAt ? { label: 'Pausieren', click: act('pause') } : { label: 'Fortsetzen', click: act('resume') },
    { label: s.phase === 'break' ? 'Pause überspringen' : 'Fokus beenden', click: act(s.phase === 'break' ? 'skip' : 'stop') },
    { label: 'Fokusansicht öffnen', click: () => (showMain(), act('open')()) },
    { type: 'separator' }
  ]
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

function createTray() {
  try {
    tray = new Tray(trayIcon())
    tray.on('click', () => (isMac ? tray?.popUpContextMenu() : mainWindow?.isVisible() && mainWindow.isFocused() ? hideToTray() : showMain()))
    buildTrayMenu()
    setInterval(buildTrayMenu, 60_000)
  } catch (err) {
    log.warn('tray unavailable', { name: (err as Error).name })
    tray = null
  }
}

// ---------- Menü ----------

function buildAppMenu() {
  const nav = (label: string, view: string, key: string): Electron.MenuItemConstructorOptions => ({
    label,
    accelerator: `CmdOrCtrl+${key}`,
    registerAccelerator: false,
    click: () => showMain(view)
  })
  const cmd = (label: string, c: string, accelerator?: string): Electron.MenuItemConstructorOptions => ({
    label,
    accelerator,
    registerAccelerator: false,
    click: () => sendCommand(c)
  })
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: 'Tagwerk',
            submenu: [
              { role: 'about', label: 'Über Tagwerk' },
              { type: 'separator' },
              cmd('Einstellungen …', 'open-settings', 'Cmd+,'),
              { type: 'separator' },
              { role: 'hide', label: 'Tagwerk ausblenden' },
              { role: 'hideOthers', label: 'Andere ausblenden' },
              { type: 'separator' },
              { label: 'Tagwerk beenden', accelerator: 'Cmd+Q', click: () => ((quitting = true), app.quit()) }
            ]
          } as Electron.MenuItemConstructorOptions
        ]
      : []),
    {
      label: 'Ablage',
      submenu: [
        cmd('Neue Aufgabe', 'new-task', 'CmdOrCtrl+N'),
        cmd('Neuer Termin', 'new-event', 'CmdOrCtrl+Shift+N'),
        cmd('Neue Notiz', 'new-note', 'CmdOrCtrl+Alt+N'),
        { label: 'Schnellnotiz', click: openQuickNote },
        { type: 'separator' },
        ...(isMac ? [] : [cmd('Einstellungen', 'open-settings', 'Ctrl+,'), { type: 'separator' as const }]),
        isMac ? { role: 'close', label: 'Fenster schließen' } : { label: 'Beenden', accelerator: 'Ctrl+Q', click: () => ((quitting = true), app.quit()) }
      ]
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { role: 'undo', label: 'Widerrufen' },
        { role: 'redo', label: 'Wiederholen' },
        { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einsetzen' },
        { role: 'selectAll', label: 'Alles auswählen' },
        { type: 'separator' },
        cmd('Suchen …', 'open-search', 'CmdOrCtrl+K')
      ]
    },
    {
      label: 'Darstellung',
      submenu: [
        nav('Heute', 'today', '1'),
        nav('Kalender', 'calendar', '2'),
        nav('Posteingang', 'inbox', '3'),
        nav('Aufgaben', 'tasks', '4'),
        nav('Notizen', 'notes', '5'),
        nav('Projekte', 'projects', '6'),
        { type: 'separator' },
        cmd('Claude-Assistent', 'toggle-assistant', 'CmdOrCtrl+J'),
        cmd('Seitenleiste ein-/ausklappen', 'toggle-sidebar', 'CmdOrCtrl+B'),
        { type: 'separator' },
        { role: 'resetZoom', label: 'Originalgröße' },
        { role: 'zoomIn', label: 'Vergrößern' },
        { role: 'zoomOut', label: 'Verkleinern' },
        { role: 'togglefullscreen', label: 'Vollbild' },
        ...(app.isPackaged ? [] : [{ type: 'separator' as const }, { role: 'reload' as const }, { role: 'toggleDevTools' as const }])
      ]
    },
    { role: 'windowMenu', label: 'Fenster' },
    {
      label: 'Hilfe',
      submenu: [cmd('Tastenkürzel', 'show-shortcuts', 'CmdOrCtrl+/')]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---------- Globale Tastenkombination ----------

let registeredShortcut = ''
function registerQuickNoteShortcut(accel: string): boolean {
  if (registeredShortcut) globalShortcut.unregister(registeredShortcut)
  registeredShortcut = ''
  if (!accel) return true
  try {
    const ok = globalShortcut.register(accel, openQuickNote)
    if (ok) registeredShortcut = accel
    return ok
  } catch {
    return false
  }
}

// ---------- Start / Autostart ----------

function applyLoginItem(s: Settings) {
  if (!app.isPackaged) return // im Entwicklungsmodus nicht den Autostart verändern
  // Store-Apps: Autostart schaltet man in Windows unter Einstellungen → Apps → Autostart
  if (isStore) return
  app.setLoginItemSettings({ openAtLogin: s.launchAtLogin, args: ['--hidden'] })
}

function addExternalNote(text: string) {
  const data = store.loadData()
  const now = new Date().toISOString()
  const firstLine = text.split(/\r?\n/)[0].trim()
  const note: Note = {
    id: `n-${randomUUID()}`,
    title: firstLine.slice(0, 80) || 'Schnellnotiz',
    body: text,
    kind: 'note',
    createdAt: now,
    updatedAt: now
  }
  if (data) store.saveData({ ...data, notes: [note, ...data.notes] })
  mainWindow?.webContents.send('data:external-note', note)
}

// ---------- IPC ----------

function registerIpc() {
  ipcMain.handle('data:load', () => store.loadData())
  ipcMain.handle('data:save', (_e, data: AppData) => {
    store.saveData(data)
    buildTrayMenu()
  })
  ipcMain.handle('data:export', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    const res = await dialog.showSaveDialog(win!, {
      title: 'Daten exportieren',
      defaultPath: `tagwerk-export-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (res.canceled || !res.filePath) return { ok: false }
    writeFileSync(res.filePath, JSON.stringify(store.loadData(), null, 2), 'utf8')
    return { ok: true, path: res.filePath }
  })
  ipcMain.handle('data:wipe', async () => {
    await google.disconnect().catch(() => {})
    google.wipeGoogle()
    store.wipe()
    secrets.wipeAll()
  })

  ipcMain.handle('settings:get', () => store.getSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    const prev = store.getSettings()
    const next = store.setSettings(patch)
    if (patch.theme) nativeTheme.themeSource = next.theme
    if (patch.launchAtLogin !== undefined) applyLoginItem(next)
    if (patch.quickNoteShortcut !== undefined && patch.quickNoteShortcut !== prev.quickNoteShortcut) {
      if (!registerQuickNoteShortcut(next.quickNoteShortcut)) {
        registerQuickNoteShortcut(prev.quickNoteShortcut)
        return store.setSettings({ quickNoteShortcut: prev.quickNoteShortcut })
      }
      buildTrayMenu()
    }
    return next
  })

  ipcMain.handle('claude:status', async () => ({ configured: secrets.hasKey(), encrypted: await secrets.encryptionAvailable() }))
  ipcMain.handle('claude:setKey', async (_e, key: string) => {
    const v = await verifyKey(String(key ?? ''), store.getSettings().claude.model, store.getSettings().claude.workspaceId)
    if (!v.ok) return v
    try {
      await secrets.setKey(key.trim())
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
  ipcMain.handle('claude:clearKey', () => secrets.clear())
  ipcMain.handle('claude:send', (_e, req: ClaudeRequest) => sendToClaude(req))

  ipcMain.handle('ics:import', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    const res = await dialog.showOpenDialog(win!, {
      title: 'Kalenderdatei importieren',
      properties: ['openFile'],
      filters: [{ name: 'Kalender (.ics)', extensions: ['ics', 'ical'] }]
    })
    if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true }
    try {
      const path = res.filePaths[0]
      const importId = `imp-${randomUUID()}`
      const events = parseIcs(readFileSync(path, 'utf8'), importId)
      const name = path.split(/[\\/]/).pop() ?? 'Kalender'
      return { ok: true, events, import: { id: importId, name, importedAt: new Date().toISOString(), count: events.length } }
    } catch (err) {
      log.warn('ics import failed', { name: (err as Error).name })
      return { ok: false, error: 'Die Datei konnte nicht als Kalender gelesen werden.' }
    }
  })

  ipcMain.handle('microsoft:status', () => microsoft.msStatus())
  ipcMain.handle('microsoft:setClient', (_e, id: string) => microsoft.setClient(String(id ?? '')))
  ipcMain.handle('microsoft:clearClient', () => microsoft.clearClient())
  ipcMain.handle('microsoft:connect', async () => {
    const r = await microsoft.connect()
    showMain()
    return r
  })
  ipcMain.handle('microsoft:cancelConnect', () => microsoft.cancelConnect())
  ipcMain.handle('microsoft:disconnect', () => microsoft.disconnect())
  ipcMain.handle('microsoft:sections', () => microsoft.sections())
  ipcMain.handle('microsoft:pages', (_e, sectionId?: string) => microsoft.pages(sectionId ? String(sectionId) : undefined))
  ipcMain.handle('microsoft:pageText', (_e, id: string) => microsoft.pageText(String(id)))
  ipcMain.handle('microsoft:savePage', (_e, r: OneNoteSaveRequest) => {
    const n = r?.note ?? ({} as OneNoteSaveRequest['note'])
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined)
    return microsoft.savePage({
      sectionId: String(r?.sectionId ?? ''),
      note: {
        title: str(n.title, 300) ?? '',
        body: str(n.body, 200_000) ?? '',
        kind: n.kind === 'meeting' ? 'meeting' : 'note',
        decisions: str(n.decisions, 50_000),
        nextSteps: str(n.nextSteps, 50_000),
        createdAt: str(n.createdAt, 40) ?? new Date().toISOString()
      },
      meta: { event: str(r?.meta?.event, 200), project: str(r?.meta?.project, 200) },
      replacePageId: r?.replacePageId ? String(r.replacePageId) : undefined
    })
  })
  // OneNote-Seite in der Desktop-App (onenote:) oder im Browser öffnen – nur diese Ziele
  ipcMain.handle('microsoft:open', (_e, url: string) => {
    const u = String(url ?? '')
    if (/^onenote:https:\/\//i.test(u) || /^https:\/\/([a-z0-9-]+\.)*(onenote\.com|onedrive\.live\.com|live\.com|sharepoint\.com|office\.com)\//i.test(u)) shell.openExternal(u)
  })
  ipcMain.handle('google:status', () => google.googleStatus())
  ipcMain.handle('google:setClient', (_e, c: { clientId: string; clientSecret: string }) => google.setClient({ clientId: String(c?.clientId ?? ''), clientSecret: String(c?.clientSecret ?? '') }))
  ipcMain.handle('google:importClientFile', () => google.importClientFile())
  ipcMain.handle('google:clearClient', () => google.clearClient())
  ipcMain.handle('google:connect', async (_e, o: GoogleConnectOptions) => {
    const r = await google.connect({ calendar: !!o?.calendar, gmail: !!o?.gmail, write: !!o?.write })
    // Nach der Anmeldung im Browser zurück zu Tagwerk
    showMain()
    return r
  })
  ipcMain.handle('google:cancelConnect', () => google.cancelConnect())
  ipcMain.handle('google:disconnect', () => google.disconnect())
  ipcMain.handle('google:sync', (_e, o?: { only?: string }) => google.sync(o?.only === 'gmail' || o?.only === 'calendar' ? { only: o.only } : undefined))
  ipcMain.handle('google:createEvent', (_e, ev: CalEvent, notify: boolean) => google.createEvent(ev, !!notify))
  ipcMain.handle('google:updateEvent', (_e, ev: CalEvent, notify: boolean) => google.updateEvent(ev, !!notify))
  ipcMain.handle('google:trashThread', (_e, id: string, restore: boolean) => google.trashThread(String(id), !!restore))
  ipcMain.handle('google:deleteEvent', (_e, id: string, notify: boolean) => google.deleteEvent(String(id), !!notify))
  ipcMain.handle('google:modifyThread', (_e, id: string, add: string[], remove: string[]) =>
    google.modifyThread(String(id), Array.isArray(add) ? add.map(String) : [], Array.isArray(remove) ? remove.map(String) : [])
  )
  ipcMain.handle('google:send', (_e, p: GoogleSendParams) => google.send(p))

  ipcMain.handle('weather:get', (_e, city: string) => getWeather(String(city ?? '')))

  ipcMain.handle('app:notify', (_e, req: NotifyRequest) => {
    if (!req || typeof req !== 'object') return { shown: false }
    const kinds = ['event', 'mail', 'brief', 'focus', 'system', 'test'] as const
    const kind = kinds.includes(req.kind as (typeof kinds)[number]) ? req.kind : 'system'
    const lines = Array.isArray(req.lines) ? req.lines.slice(0, 5).map((l) => String(l)) : undefined
    const target = req.target && typeof req.target === 'object' ? { view: String(req.target.view), id: req.target.id ? String(req.target.id) : undefined } : undefined
    return notify({ title: String(req.title ?? ''), body: String(req.body ?? ''), kind, target, lines })
  })

  ipcMain.handle('quicknote:save', (_e, text: string) => {
    const t = String(text ?? '').trim()
    if (t) addExternalNote(t)
    quickWindow?.close()
  })
  ipcMain.on('quicknote:close', () => quickWindow?.close())
  ipcMain.handle('update:status', () => updateStatus())
  ipcMain.handle('update:check', () => checkUpdate())
  ipcMain.on('update:install', () => {
    quitting = true
    installNow()
  })
  ipcMain.on('focus:signal', (_e, sig: FocusSignal) => {
    if (!sig || typeof sig !== 'object') return
    setFocus({
      active: !!sig.active,
      phase: sig.phase === 'break' ? 'break' : 'focus',
      endsAt: typeof sig.endsAt === 'number' ? sig.endsAt : null,
      remainingMs: Number(sig.remainingMs) || 0,
      totalMs: Number(sig.totalMs) || 1,
      label: String(sig.label ?? '').slice(0, 120),
      allowMeetingAlerts: !!sig.allowMeetingAlerts
    })
  })
}

// ---------- Init ----------

function init() {
  const settings = store.getSettings()
  nativeTheme.themeSource = settings.theme

  // Oberfläche braucht keine Gerätezugriffe (Kamera, Mikrofon, Standort …).
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))

  registerIpc()
  buildAppMenu()
  createTray()
  initUpdater(() => mainWindow, (v) =>
    notify({ kind: 'update', title: `Tagwerk ${v} ist bereit`, body: 'Der Neustart dauert nur ein paar Sekunden. Deine Daten bleiben erhalten.' })
  )
  initPopup({
    preload: join(__dirname, '../preload/index.js'),
    load,
    harden: hardenContents,
    onAction: handlePopupAction
  })
  initFocus({ window: () => mainWindow, changed: () => buildTrayMenu(), open: () => (showMain(), mainWindow?.webContents.send('focus:action', 'open')) })

  // Store-Autostart kann keine Parameter übergeben – kurz nach dem Hochfahren still starten
  const startHidden = process.argv.includes('--hidden') || (isStore && uptime() < 240)
  createMainWindow(startHidden && !!tray)

  if (!registerQuickNoteShortcut(settings.quickNoteShortcut)) {
    log.warn('global shortcut unavailable')
  }
  applyLoginItem(settings)
  initNotify({
    open: openTarget,
    command: (cmd) => mainWindow?.webContents.send('app:command', cmd),
    install: () => {
      quitting = true
      installNow()
    },
    icon: resource('icon.png')
  })
  startScheduler()
  google.startLiveWatch((what) => mainWindow?.webContents.send('google:changed', what))

  nativeTheme.on('updated', () => {
    if (!isMac && mainWindow) mainWindow.setTitleBarOverlay(overlayColors())
    if (tray && !isMac) tray.setImage(trayIcon())
  })

  app.on('activate', () => showMain())
}

app.on('before-quit', () => {
  quitting = true
  saveBounds()
})
app.on('will-quit', () => (trace('quit'), globalShortcut.unregisterAll()))
app.on('window-all-closed', () => {
  if (!tray && !isMac) app.quit()
})
