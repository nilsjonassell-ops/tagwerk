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
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { eventsOnDay, hm } from '@shared/analysis'
import type { AppData, ClaudeRequest, Note, Settings } from '@shared/types'
import { store } from './store'
import { secrets } from './secrets'
import { sendToClaude, verifyKey } from './claude'
import { parseIcs } from './ics'
import { getWeather } from './weather'
import { startScheduler } from './scheduler'
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
if (isWin) app.setAppUserModelId('de.nilssell.tagwerk')

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showMain())
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
  return dark ? { color: '#171b1a', symbolColor: '#d9dfdc', height: 44 } : { color: '#eef1ef', symbolColor: '#2a3330', height: 44 }
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
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#171b1a' : '#eef1ef',
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
    saveBounds()
    if (!quitting && store.getSettings().closeToTray && tray) {
      e.preventDefault()
      mainWindow?.hide()
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
  if (!mainWindow) createMainWindow(false)
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  if (view) mainWindow.webContents.send('app:navigate', view)
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
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1f2422' : '#ffffff',
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
      { label: 'Tagwerk öffnen', click: () => showMain('today') },
      { label: 'Schnellnotiz', accelerator: store.getSettings().quickNoteShortcut, registerAccelerator: false, click: openQuickNote },
      { label: 'Neue Aufgabe', click: () => sendCommand('new-task') },
      { label: 'Claude fragen', click: () => sendCommand('open-assistant') },
      { type: 'separator' },
      { label: 'Einstellungen', click: () => sendCommand('open-settings') },
      { label: 'Tagwerk beenden', click: () => ((quitting = true), app.quit()) }
    ])
  )
  tray.setToolTip(next ? `Tagwerk – ${hm(next.start)} ${next.title}` : 'Tagwerk')
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

function createTray() {
  try {
    tray = new Tray(trayIcon())
    tray.on('click', () => (isMac ? tray?.popUpContextMenu() : mainWindow?.isVisible() && mainWindow.isFocused() ? mainWindow.hide() : showMain()))
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
        isMac ? { role: 'close', label: 'Fenster schließen' } : { label: 'Beenden', click: () => ((quitting = true), app.quit()) }
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
        cmd('Seitenleiste ein/aus', 'toggle-sidebar', 'CmdOrCtrl+\\'),
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
  ipcMain.handle('data:wipe', () => {
    store.wipe()
    secrets.clear()
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
    const v = await verifyKey(String(key ?? ''), store.getSettings().claude.model)
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

  ipcMain.handle('weather:get', (_e, city: string) => getWeather(String(city ?? '')))

  ipcMain.handle('app:notify', (_e, title: string, body: string) => {
    if (Notification.isSupported()) new Notification({ title: String(title), body: String(body) }).show()
  })

  ipcMain.handle('quicknote:save', (_e, text: string) => {
    const t = String(text ?? '').trim()
    if (t) addExternalNote(t)
    quickWindow?.close()
  })
  ipcMain.on('quicknote:close', () => quickWindow?.close())
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

  const startHidden = process.argv.includes('--hidden')
  createMainWindow(startHidden && !!tray)

  if (!registerQuickNoteShortcut(settings.quickNoteShortcut)) {
    log.warn('global shortcut unavailable')
  }
  applyLoginItem(settings)
  startScheduler((view) => showMain(view))

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
app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => {
  if (!tray && !isMac) app.quit()
})
