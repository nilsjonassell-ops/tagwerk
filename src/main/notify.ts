// Zentrale Stelle für alle Benachrichtigungen: Ruhezeiten, Fokus-Modus, Ton und
// Klickziel werden hier einheitlich behandelt. Dargestellt wird entweder als
// eigenes Tagwerk-Pop-up unten rechts (Standard) oder als Windows-Mitteilung.

import { Notification, nativeImage } from 'electron'
import type { NotifyRequest, PopupAction, PopupItem } from '@shared/types'
import { store } from './store'
import { focusMute } from './focus'
import { inQuietHours } from '@shared/analysis'
import { showPopup } from './popup'

interface Deps {
  open: (t: { view: string; id?: string }) => void
  /** Befehl an das Hauptfenster, ohne es nach vorn zu holen */
  command: (cmd: string) => void
  install: () => void
  icon?: string
}

let deps: Deps = { open: () => {}, command: () => {}, install: () => {} }
const requests = new Map<string, NotifyRequest>()
let seq = 0

export function initNotify(d: Deps) {
  deps = d
}

const hm = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

export function notify(req: NotifyRequest): { shown: boolean; reason?: string } {
  const s = store.getSettings().notifications
  const urgent = req.kind === 'test' || req.kind === 'focus' || req.kind === 'update'
  if (!urgent && inQuietHours(new Date(), s.quiet)) return { shown: false, reason: 'quiet' }
  const fm = focusMute()
  if (fm.muted && (req.kind === 'mail' || req.kind === 'brief' || req.kind === 'system' || (req.kind === 'event' && !fm.allowMeetings))) {
    return { shown: false, reason: 'focus' }
  }

  if (s.style === 'windows') return windowsNotification(req, s.sound)

  const id =
    req.kind === 'update' || req.kind === 'review' ? req.kind : (req.kind === 'event' || req.kind === 'task') && req.target?.id ? `${req.kind}:${req.target.id}` : `n${++seq}`
  requests.set(id, req)
  if (requests.size > 40) requests.delete(requests.keys().next().value!)
  showPopup(toItem(id, req, s.sound))
  return { shown: true }
}

function toItem(id: string, req: NotifyRequest, sound: boolean): PopupItem {
  const t = req.target
  let actions: PopupAction[] = []
  let meta: string | undefined
  switch (req.kind) {
    case 'mail':
      meta = 'E-Mail'
      actions = t?.id
        ? [
            { id: 'archive', label: 'Archivieren' },
            { id: 'open', label: 'Öffnen', primary: true }
          ]
        : [{ id: 'open', label: 'Posteingang öffnen', primary: true }]
      break
    case 'event':
      meta = req.event ? `Termin · ${hm(req.event.start)}–${hm(req.event.end)}` : 'Termin'
      actions = [
        { id: 'snooze', label: 'In 5 Min. erinnern' },
        { id: 'open', label: 'Öffnen', primary: true }
      ]
      break
    case 'update':
      meta = 'Update'
      actions = [
        { id: 'later', label: 'Später' },
        { id: 'install', label: 'Jetzt neu starten', primary: true }
      ]
      break
    case 'task':
      meta = 'Aufgabe'
      actions = [
        { id: 'snooze', label: 'In 10 Min.' },
        { id: 'done', label: 'Erledigt', primary: true }
      ]
      break
    case 'review':
      meta = 'Wochenrückblick'
      actions = [{ id: 'open', label: 'Rückblick ansehen', primary: true }]
      break
    case 'brief':
      meta = 'Tagesüberblick'
      actions = [{ id: 'open', label: 'Übersicht öffnen', primary: true }]
      break
    case 'focus':
      meta = 'Fokus'
      if (t) actions = [{ id: 'open', label: 'Öffnen', primary: true }]
      break
    case 'test':
      meta = 'Test'
      actions = [{ id: 'open', label: 'Einstellungen', primary: true }]
      break
    default:
      meta = 'Hinweis'
      if (t) actions = [{ id: 'open', label: 'Öffnen', primary: true }]
  }
  return {
    id,
    kind: req.kind,
    title: String(req.title).slice(0, 140),
    body: String(req.body ?? '').slice(0, 400),
    lines: req.lines?.slice(0, 3).map((l) => String(l).slice(0, 120)),
    meta,
    actions,
    sticky: req.kind === 'event' || req.kind === 'update' || req.kind === 'task' || req.kind === 'review',
    sound: sound && req.kind !== 'update',
    at: Date.now()
  }
}

/** Klick auf eine Schaltfläche im Pop-up (oder auf die Karte selbst = „open“). */
export function handlePopupAction(item: PopupItem, action: PopupAction['id']) {
  const req = requests.get(item.id)
  requests.delete(item.id)
  if (!req) return
  const t = req.target
  switch (action) {
    case 'open':
      if (t) deps.open({ view: String(t.view), id: t.id ? String(t.id) : undefined })
      break
    case 'archive':
      if (t?.id) deps.command(`mail-archive:${t.id}`)
      break
    case 'read':
      if (t?.id) deps.command(`mail-read:${t.id}`)
      break
    case 'install':
      deps.install()
      break
    case 'done':
      if (t?.id?.startsWith('task:')) deps.command(`task-done:${t.id.slice(5)}`)
      break
    case 'snooze': {
      if (req.kind === 'task') {
        setTimeout(() => notify(req), 10 * 60_000)
        break
      }
      const ev = req.event
      setTimeout(() => {
        if (!ev) return void notify(req)
        const mins = Math.round((new Date(ev.start).getTime() - Date.now()) / 60_000)
        const head = mins > 0 ? `In ${mins} Min.: ${ev.title}` : mins > -2 ? `Jetzt: ${ev.title}` : `Läuft seit ${-mins} Min.: ${ev.title}`
        notify({ ...req, title: head })
      }, 5 * 60_000)
      break
    }
  }
}

function windowsNotification(req: NotifyRequest, sound: boolean): { shown: boolean; reason?: string } {
  if (!Notification.isSupported()) return { shown: false, reason: 'unsupported' }
  const body = [req.body, ...(req.lines ?? [])].filter(Boolean).join('\n')
  const n = new Notification({
    title: String(req.title).slice(0, 120),
    body: body.slice(0, 300),
    silent: !sound,
    icon: deps.icon ? nativeImage.createFromPath(deps.icon) : undefined
  })
  const t = req.kind === 'update' ? { view: 'command', id: 'open-general-settings' } : req.target
  if (t) {
    const target = { view: String(t.view), id: t.id ? String(t.id) : undefined }
    n.on('click', () => deps.open(target))
  }
  n.show()
  return { shown: true }
}
