// Eigene Pop-ups unten rechts auf dem Bildschirm – für E-Mails, Termine,
// Erinnerungen und Updates. Ein kleines, durchsichtiges Fenster ohne Rahmen,
// das nie den Fokus stiehlt und sich der Höhe seines Inhalts anpasst.

import { BrowserWindow, ipcMain, screen } from 'electron'
import type { PopupAction, PopupItem } from '@shared/types'

const WIDTH = 404 // Karte 372 px + Platz für den Schatten
const MAX_ITEMS = 4

interface Deps {
  preload: string
  load: (win: BrowserWindow, hash: string) => void
  harden: (wc: Electron.WebContents) => void
  onAction: (item: PopupItem, action: PopupAction['id']) => void
}

let deps: Deps | null = null
let win: BrowserWindow | null = null
let ready = false
let items: PopupItem[] = []

export function initPopup(d: Deps) {
  deps = d
  ipcMain.on('popup:ready', () => {
    ready = true
    send()
  })
  ipcMain.on('popup:size', (_e, h: number) => place(Math.ceil(Number(h) || 0)))
  ipcMain.on('popup:action', (_e, id: string, action: PopupAction['id'] | 'dismiss') => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    items = items.filter((i) => i.id !== id)
    send()
    if (action !== 'dismiss') deps?.onAction(item, action)
  })
}

export function showPopup(item: PopupItem) {
  items = [...items.filter((i) => i.id !== item.id), item].slice(-MAX_ITEMS)
  ensureWindow()
  send()
}

export function hasPopups() {
  return items.length > 0
}

function send() {
  if (win && !win.isDestroyed() && ready) win.webContents.send('popup:items', items)
}

function ensureWindow() {
  if (!deps || (win && !win.isDestroyed())) return
  ready = false
  win = new BrowserWindow({
    width: WIDTH,
    height: 10,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: deps.preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      // Hinweiston ohne vorherigen Klick erlauben
      autoplayPolicy: 'no-user-gesture-required'
    }
  })
  win.setAlwaysOnTop(true, 'pop-up-menu')
  win.setVisibleOnAllWorkspaces(true)
  deps.harden(win.webContents)
  deps.load(win, 'popup')
  win.on('closed', () => {
    win = null
    ready = false
  })
}

/** Unten rechts über der Taskleiste – auf dem Bildschirm, auf dem die Maus gerade ist. */
function place(height: number) {
  if (!win || win.isDestroyed()) return
  if (height <= 0 || items.length === 0) {
    if (win.isVisible()) win.hide()
    return
  }
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  const h = Math.min(height, area.height)
  win.setBounds({ x: area.x + area.width - WIDTH, y: area.y + area.height - h, width: WIDTH, height: h })
  if (!win.isVisible()) win.showInactive()
}
