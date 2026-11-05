// Web-Vorschau: simuliertes OneDrive für geteilte Einkaufslisten.
// Alle Tabs desselben Browsers teilen sich diesen Speicher – zwei Tabs verhalten sich wie zwei Personen.
// Es wird nichts an Microsoft gesendet und niemand wirklich eingeladen.
import { joinCode, parseJoin, readDoc, runSharedSync, type SharedIo } from '@shared/shopping-share'
import { editItem, quickItem } from '@shared/shopping'
import type { ShareMember, ShoppingShareApi, SharedListDoc } from '@shared/types'

const KEY = 'tagwerk-web:shared-drive'
interface SimFile {
  doc: SharedListDoc
  etag: number
  members: ShareMember[]
}
interface SimDrive {
  files: Record<string, SimFile>
}
const load = (): SimDrive => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '') as SimDrive
  } catch {
    return { files: {} }
  }
}
const save = (d: SimDrive) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch {
    /* privates Fenster */
  }
}

const sim = { offline: false, syncs: 0 }
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms))
const offline = { ok: false as const, error: 'Keine Verbindung zu OneDrive (simuliert).', code: 'offline' as const }

function io(itemId: string): SharedIo {
  return {
    async read() {
      const f = load().files[itemId]
      return f ? { doc: structuredClone(f.doc), etag: String(f.etag) } : null
    },
    async write(doc, ifMatch) {
      const d = load()
      const f = d.files[itemId]
      if (f && ifMatch !== String(f.etag)) return { ok: false, conflict: true }
      d.files[itemId] = { doc, etag: (f?.etag ?? 0) + 1, members: f?.members ?? [] }
      save(d)
      return { ok: true, etag: String(d.files[itemId].etag) }
    }
  }
}

/** Simulierte Mitbewohnerin nimmt die Einladung an und ändert einmal etwas – damit man den Abgleich sieht */
function playPartner(itemId: string, email: string) {
  if (navigator.webdriver) return
  setTimeout(() => {
    const d = load()
    const f = d.files[itemId]
    const m = f?.members.find((x) => x.email === email)
    if (!f || !m) return
    m.pending = false
    m.name = 'Anna (Testkonto)'
    const it = quickItem(Object.values(f.doc.items)[0]?.listId ?? 'shared', 'Bananen', 'Anna (Testkonto)', Date.now())
    f.doc.items[it.id] = it
    f.etag++
    save(d)
  }, 6000)
}

const ME = 'du@beispiel.de'

export const shareSim: ShoppingShareApi = {
  available: async () => true,
  async create(name, items) {
    await wait()
    if (sim.offline) return offline
    const id = `sim-${crypto.randomUUID()}`
    const d = load()
    d.files[id] = { doc: { v: 1, name, items: Object.fromEntries(items.map((i) => [i.id, i])) }, etag: 1, members: [{ id: 'owner', name: 'Du (Testkonto)', email: ME, role: 'owner' }] }
    save(d)
    return { ok: true, value: { role: 'owner', driveId: 'sim-drive', itemId: id, ownerName: 'Du (Testkonto)', lastSync: new Date().toISOString() } }
  },
  async invite(share, emails) {
    await wait()
    if (sim.offline) return offline
    const d = load()
    const f = d.files[share.itemId]
    if (!f) return { ok: false, error: 'Liste nicht gefunden (simuliert).', code: 'not-found' }
    for (const e of emails.map((x) => x.trim().toLowerCase()).filter(Boolean)) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: `Keine gültige E-Mail-Adresse: ${e}` }
      if (!f.members.some((m) => m.email === e)) {
        f.members.push({ id: `p-${crypto.randomUUID()}`, name: e, email: e, role: 'write', pending: true })
        playPartner(share.itemId, e)
      }
    }
    save(d)
    return { ok: true, value: f.members }
  },
  async members(share) {
    await wait(120)
    if (sim.offline) return offline
    const f = load().files[share.itemId]
    return f ? { ok: true, value: f.members } : { ok: false, error: 'Liste nicht gefunden (simuliert).', code: 'not-found' }
  },
  async removeMember(share, id) {
    await wait()
    if (sim.offline) return offline
    const d = load()
    const f = d.files[share.itemId]
    if (f) f.members = f.members.filter((m) => m.id !== id || m.role === 'owner')
    save(d)
    return { ok: true, value: null }
  },
  async join(input) {
    await wait()
    if (sim.offline) return offline
    const t = parseJoin(input)
    if (!t) return { ok: false, error: 'Das ist weder ein Beitrittscode (TW1-…) noch ein OneDrive-Einladungslink.' }
    if (t.kind === 'link') return { ok: false, error: 'Einladungslinks funktionieren nur in der App. In der Web-Vorschau den Beitrittscode verwenden.' }
    const d = load()
    const f = d.files[t.itemId]
    if (!f) return { ok: false, code: 'denied', error: 'Kein Zugriff – diese Liste wurde nicht mit dir geteilt (simuliert).' }
    if (!f.members.some((m) => m.email === 'mitglied@beispiel.de')) f.members.push({ id: `p-${crypto.randomUUID()}`, name: 'Zweiter Tab (Testkonto)', email: 'mitglied@beispiel.de', role: 'write' })
    save(d)
    return { ok: true, value: { share: { role: 'member', driveId: t.driveId, itemId: t.itemId, ownerName: 'Du (Testkonto)', lastSync: new Date().toISOString() }, name: f.doc.name } }
  },
  async sync(share, local, name) {
    sim.syncs++
    await wait(150)
    if (sim.offline) return offline
    if (!load().files[share.itemId]) return { ok: false, error: 'Die Liste wurde nicht gefunden – vielleicht wurde das Teilen beendet.', code: 'not-found' }
    const r = await runSharedSync(io(share.itemId), local, name, Date.now())
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, value: { items: r.value.items, name: r.value.name, etag: r.value.etag, conflicts: r.value.conflicts } }
  },
  async leave(share) {
    await wait()
    if (share.role === 'owner') {
      const d = load()
      const f = d.files[share.itemId]
      if (f) f.members = f.members.filter((m) => m.role === 'owner')
      save(d)
    }
    return { ok: true, value: null }
  }
}

/** Testhaken für die Oberflächen-Tests: Offline schalten, „fremde“ Änderung einspielen */
export const shareSimHooks = {
  setOffline(v: boolean) {
    sim.offline = v
  },
  /** Anzahl der Abgleiche (erkennt Dauerschleifen) */
  syncCount: () => sim.syncs,
  /** Änderung einer anderen Person direkt in der gemeinsamen Datei */
  remoteEdit(itemId: string, fn: (doc: SharedListDoc) => void) {
    const d = load()
    const f = d.files[itemId]
    if (!f) return false
    fn(f.doc)
    f.etag++
    save(d)
    return true
  },
  file(itemId: string) {
    const f = load().files[itemId]
    return f ? readDoc(f.doc) : null
  },
  joinCodeFor(itemId: string) {
    return joinCode({ driveId: 'sim-drive', itemId, role: 'owner' })
  },
  helpers: { editItem, quickItem }
}
