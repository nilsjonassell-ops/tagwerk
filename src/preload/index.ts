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
  google: {
    status: () => ipcRenderer.invoke('google:status'),
    setClient: (c) => ipcRenderer.invoke('google:setClient', c),
    importClientFile: () => ipcRenderer.invoke('google:importClientFile'),
    clearClient: () => ipcRenderer.invoke('google:clearClient'),
    connect: (o) => ipcRenderer.invoke('google:connect', o),
    cancelConnect: () => ipcRenderer.invoke('google:cancelConnect'),
    disconnect: () => ipcRenderer.invoke('google:disconnect'),
    sync: (o) => ipcRenderer.invoke('google:sync', o),
    onMailChanged: (cb) => {
      const h = () => cb()
      ipcRenderer.on('google:mailChanged', h)
      return () => ipcRenderer.removeListener('google:mailChanged', h)
    },
    createEvent: (ev, notify) => ipcRenderer.invoke('google:createEvent', ev, notify),
    updateEvent: (ev, notify) => ipcRenderer.invoke('google:updateEvent', ev, notify),
    deleteEvent: (id, notify) => ipcRenderer.invoke('google:deleteEvent', id, notify),
    trashThread: (id, restore) => ipcRenderer.invoke('google:trashThread', id, !!restore),
    modifyThread: (id, add, remove) => ipcRenderer.invoke('google:modifyThread', id, add, remove),
    send: (p) => ipcRenderer.invoke('google:send', p)
  },
  weather: { get: (city) => ipcRenderer.invoke('weather:get', city) },
  app: {
    notify: (req) => ipcRenderer.invoke('app:notify', req),
    onNavigate: (cb) => on('app:navigate', cb),
    onOpen: (cb) => on('app:open', cb),
    onCommand: (cb) => on('app:command', cb)
  },
  popup: {
    onItems: (cb) => on('popup:items', cb),
    ready: () => ipcRenderer.send('popup:ready'),
    size: (h) => ipcRenderer.send('popup:size', h),
    action: (id, action) => ipcRenderer.send('popup:action', id, action)
  },
  updates: {
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.send('update:install'),
    onStatus: (cb) => on('update:status', cb)
  },
  focus: {
    signal: (s) => ipcRenderer.send('focus:signal', s),
    onAction: (cb) => on('focus:action', cb)
  },
  quickNote: {
    save: (text) => ipcRenderer.invoke('quicknote:save', text),
    close: () => ipcRenderer.send('quicknote:close')
  }
}

contextBridge.exposeInMainWorld('tagwerk', api)
