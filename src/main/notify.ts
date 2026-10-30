// Zentrale Stelle für alle Systembenachrichtigungen: Ruhezeiten, Fokus-Modus,
// Ton und Klickziel werden hier einheitlich behandelt.

import { Notification, nativeImage } from 'electron'
import type { NotifyRequest } from '@shared/types'
import { store } from './store'
import { focusMute } from './focus'
import { inQuietHours } from '@shared/analysis'

let openTarget: (t: { view: string; id?: string }) => void = () => {}
let iconPath: string | undefined

export function initNotify(opts: { open: (t: { view: string; id?: string }) => void; icon?: string }) {
  openTarget = opts.open
  iconPath = opts.icon
}

export function notify(req: NotifyRequest): { shown: boolean; reason?: string } {
  if (!Notification.isSupported()) return { shown: false, reason: 'unsupported' }
  const s = store.getSettings().notifications
  if (req.kind !== 'test' && req.kind !== 'focus' && inQuietHours(new Date(), s.quiet)) return { shown: false, reason: 'quiet' }
  const fm = focusMute()
  if (fm.muted && (req.kind === 'mail' || req.kind === 'brief' || req.kind === 'system' || (req.kind === 'event' && !fm.allowMeetings))) {
    return { shown: false, reason: 'focus' }
  }
  const n = new Notification({
    title: String(req.title).slice(0, 120),
    body: String(req.body).slice(0, 300),
    silent: !s.sound,
    icon: iconPath ? nativeImage.createFromPath(iconPath) : undefined
  })
  if (req.target) {
    const target = { view: String(req.target.view), id: req.target.id ? String(req.target.id) : undefined }
    n.on('click', () => openTarget(target))
  }
  n.show()
  return { shown: true }
}
