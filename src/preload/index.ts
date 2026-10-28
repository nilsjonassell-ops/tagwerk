// Schmale, typisierte Brücke zwischen Oberfläche und Hauptprozess.
import { contextBridge, ipcRenderer } from 'electron'
import type { TagwerkApi } from '@shared/types'

const on = <T>(channel: string, cb: (v: T) => void) => {
  const handler = (_e: unknown, v: T) => cb(v)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: TagwerkApi = {
  platform: {
    platform: process.platform as TagwerkApi['platform']['platform'],
    version: process.versions.electron ?? ''
  },
  data: {
    load: () => ipcRenderer.invoke('data:load'),
    save: (data) => ipcRenderer.invoke('data:save', data),
    exportJson: () => ipcRenderer.invoke('data:export'),
    wipe: () => ipcRenderer.invoke('data:wipe'),
    onExternalNote: (cb) => on('data:external-note', cb)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch)
  },
  claude: {
    status: () => ipcRenderer.invoke('claude:status'),
    setKey: (key) => ipcRenderer.invoke('claude:setKey', key),
    clearKey: () => ipcRenderer.invoke('claude:clearKey'),
    send: (req) => ipcRenderer.invoke('claude:send', req)
  },
  ics: { import: () => ipcRenderer.invoke('ics:import') },
  weather: { get: (city) => ipcRenderer.invoke('weather:get', city) },
  app: {
    notify: (title, body) => ipcRenderer.invoke('app:notify', title, body),
    onNavigate: (cb) => on('app:navigate', cb),
    onCommand: (cb) => on('app:command', cb)
  },
  quickNote: {
    save: (text) => ipcRenderer.invoke('quicknote:save', text),
    close: () => ipcRenderer.send('quicknote:close')
  }
}

contextBridge.exposeInMainWorld('tagwerk', api)
