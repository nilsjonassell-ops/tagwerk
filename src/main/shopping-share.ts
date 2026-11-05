// Geteilte Einkaufslisten über OneDrive (Microsoft Graph, vom PC aus, kein eigener Server).
// Eigentümer: Datei in „OneDrive/Tagwerk Geteilt/“, Einladung per Microsoft an bestimmte E-Mail-Adressen (Anmeldung Pflicht).
// Mitglieder: öffnen die Datei über Einladungslink oder Beitrittscode – nur möglich, wenn sie eingeladen wurden.
import { driveFetch, msCaps, msEmail, msErrorText } from './microsoft'
import { encodeShareUrl, parseJoin, readDoc, runSharedSync, type SharedIo } from '@shared/shopping-share'
import type { ShareMember, ShareResult, SharedListDoc, ShareSyncResult, ShoppingItem, ShoppingShare } from '@shared/types'

const FOLDER = 'Tagwerk Geteilt'
const itemPath = (s: Pick<ShoppingShare, 'driveId' | 'itemId'>) => `/drives/${encodeURIComponent(s.driveId)}/items/${encodeURIComponent(s.itemId)}`

function fail<T>(e: unknown): ShareResult<T> {
  const msg = msErrorText(e)
  return { ok: false, error: msg, code: /nicht erreichbar/.test(msg) ? 'offline' : /abgelaufen/.test(msg) ? 'expired' : /nicht verbunden/i.test(msg) ? 'not-connected' : 'unknown' }
}
async function httpError<T>(res: Response, what: string): Promise<ShareResult<T>> {
  const j = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } }
  if (res.status === 403 || res.status === 401 || j.error?.code === 'accessDenied')
    return { ok: false, code: 'denied', error: `Kein Zugriff (${what}). Wurdest du mit genau diesem Microsoft-Konto (${msEmail() || 'angemeldet'}) eingeladen?` }
  if (res.status === 404) return { ok: false, code: 'not-found', error: `Die Liste wurde nicht gefunden – vielleicht hat die Eigentümerin sie gelöscht oder das Teilen beendet.` }
  if (res.status === 429) return { ok: false, code: 'unknown', error: 'OneDrive bittet um eine kurze Pause. Tagwerk versucht es gleich wieder.' }
  return { ok: false, code: 'unknown', error: `OneDrive-Fehler beim ${what} (${(j.error?.message ?? String(res.status)).slice(0, 120)}).` }
}

export async function available(): Promise<boolean> {
  return !!msCaps().share
}

function io(share: ShoppingShare): SharedIo {
  return {
    async read() {
      const meta = await driveFetch(`${itemPath(share)}?$select=id,eTag`)
      if (meta.status === 404) return null
      if (!meta.ok) throw Object.assign(new Error('read'), { res: meta })
      const etag = ((await meta.json()) as { eTag: string }).eTag
      const body = await driveFetch(`${itemPath(share)}/content`)
      if (!body.ok) throw Object.assign(new Error('read'), { res: body })
      return { doc: (await body.json().catch(() => null)) as SharedListDoc, etag }
    },
    async write(doc, ifMatch) {
      const res = await driveFetch(`${itemPath(share)}/content`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...(ifMatch ? { 'if-match': ifMatch } : {}) },
        body: JSON.stringify(doc)
      })
      if (res.status === 412 || res.status === 409) return { ok: false, conflict: true }
      if (!res.ok) throw Object.assign(new Error('write'), { res })
      return { ok: true, etag: ((await res.json()) as { eTag: string }).eTag }
    }
  }
}

export async function create(name: string, items: ShoppingItem[]): Promise<ShareResult<ShoppingShare>> {
  try {
    const safe = String(name).replace(/[\\/:*?"<>|#%]/g, ' ').trim().slice(0, 60) || 'Einkaufsliste'
    const file = `Einkaufsliste – ${safe} – ${Date.now().toString(36)}.json`
    const doc: SharedListDoc = { v: 1, name: String(name).slice(0, 80), items: Object.fromEntries(items.map((i) => [i.id, i])) }
    const res = await driveFetch(`/me/drive/root:/${encodeURIComponent(FOLDER)}/${encodeURIComponent(file)}:/content?@microsoft.graph.conflictBehavior=fail`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(doc)
    })
    if (!res.ok) return httpError(res, 'Anlegen der Liste')
    const j = (await res.json()) as { id: string; parentReference?: { driveId?: string } }
    if (!j.id || !j.parentReference?.driveId) return { ok: false, error: 'OneDrive hat die Liste ohne Kennung angelegt.' }
    return { ok: true, value: { role: 'owner', driveId: j.parentReference.driveId, itemId: j.id, ownerName: msEmail(), lastSync: new Date().toISOString() } }
  } catch (e) {
    return fail(e)
  }
}

interface Permission {
  id: string
  roles?: string[]
  grantedToV2?: { user?: { displayName?: string; email?: string } }
  grantedTo?: { user?: { displayName?: string; email?: string } }
  grantedToIdentitiesV2?: { user?: { displayName?: string; email?: string } }[]
  invitation?: { email?: string }
  link?: { scope?: string }
}

function toMember(p: Permission): ShareMember | null {
  const u = p.grantedToV2?.user ?? p.grantedTo?.user ?? p.grantedToIdentitiesV2?.[0]?.user
  const email = p.invitation?.email ?? u?.email
  const roles = p.roles ?? []
  const role: ShareMember['role'] = roles.includes('owner') ? 'owner' : roles.includes('write') ? 'write' : 'read'
  // Anonyme Links gibt es bei Tagwerk nicht; sollten welche existieren, werden sie angezeigt, damit man sie entfernen kann
  const name = u?.displayName || email || (p.link ? `Freigabelink (${p.link.scope ?? 'unbekannt'})` : 'Unbekannt')
  return { id: p.id, name, email, role, pending: !u && !!p.invitation }
}

export async function members(share: ShoppingShare): Promise<ShareResult<ShareMember[]>> {
  try {
    const res = await driveFetch(`${itemPath(share)}/permissions`)
    if (!res.ok) return httpError(res, 'Abrufen der Mitglieder')
    const j = (await res.json()) as { value?: Permission[] }
    const list = (j.value ?? []).map(toMember).filter((m): m is ShareMember => !!m)
    return { ok: true, value: list.sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.name.localeCompare(b.name))) }
  } catch (e) {
    return fail(e)
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export async function invite(share: ShoppingShare, emails: string[], message?: string): Promise<ShareResult<ShareMember[]>> {
  const list = [...new Set((emails ?? []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))]
  const bad = list.filter((e) => !EMAIL.test(e))
  if (!list.length || bad.length) return { ok: false, error: bad.length ? `Keine gültige E-Mail-Adresse: ${bad.join(', ')}` : 'Bitte eine E-Mail-Adresse eingeben.' }
  try {
    const res = await driveFetch(`${itemPath(share)}/invite`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        recipients: list.map((email) => ({ email })),
        requireSignIn: true,
        sendInvitation: true,
        roles: ['write'],
        message: String(message ?? 'Ich teile meine Tagwerk-Einkaufsliste mit dir. Öffne in Tagwerk „Essen → Einkaufsliste → Liste beitreten“ und füge diesen Link ein.').slice(0, 1900)
      })
    })
    if (!res.ok && res.status !== 207) return httpError(res, 'Einladen')
    return members(share)
  } catch (e) {
    return fail(e)
  }
}

export async function removeMember(share: ShoppingShare, memberId: string): Promise<ShareResult<null>> {
  try {
    const res = await driveFetch(`${itemPath(share)}/permissions/${encodeURIComponent(memberId)}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 404) return httpError(res, 'Entfernen des Zugriffs')
    return { ok: true, value: null }
  } catch (e) {
    return fail(e)
  }
}

export async function join(input: string): Promise<ShareResult<{ share: ShoppingShare; name: string }>> {
  const t = parseJoin(String(input ?? ''))
  if (!t) return { ok: false, error: 'Das ist weder ein Beitrittscode (TW1-…) noch ein OneDrive-Einladungslink.' }
  try {
    const res =
      t.kind === 'code'
        ? await driveFetch(`/drives/${encodeURIComponent(t.driveId)}/items/${encodeURIComponent(t.itemId)}?$select=id,name,parentReference,createdBy`)
        : await driveFetch(`/shares/${encodeShareUrl(t.url)}/driveItem?$select=id,name,parentReference,createdBy`, { headers: { prefer: 'redeemSharingLink' } })
    if (!res.ok) return httpError(res, 'Öffnen der Liste')
    const j = (await res.json()) as { id: string; parentReference?: { driveId?: string }; createdBy?: { user?: { displayName?: string } } }
    const driveId = j.parentReference?.driveId ?? (t.kind === 'code' ? t.driveId : '')
    if (!driveId) return { ok: false, error: 'OneDrive liefert keinen Speicherort für diese Liste.' }
    const share: ShoppingShare = { role: 'member', driveId, itemId: j.id, ownerName: j.createdBy?.user?.displayName }
    const cur = await io(share).read()
    const doc = cur ? readDoc(cur.doc) : null
    if (!doc) return { ok: false, error: 'Das ist keine Tagwerk-Einkaufsliste.' }
    return { ok: true, value: { share: { ...share, lastSync: new Date().toISOString() }, name: doc.name } }
  } catch (e) {
    return fail(e)
  }
}

export async function sync(share: ShoppingShare, local: ShoppingItem[], name: string): Promise<ShareResult<ShareSyncResult>> {
  try {
    const r = await runSharedSync(io(share), Array.isArray(local) ? local : [], String(name ?? ''), Date.now())
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, value: { items: r.value.items, name: r.value.name, etag: r.value.etag, conflicts: r.value.conflicts } }
  } catch (e) {
    const res = (e as { res?: Response }).res
    if (res) return httpError(res, 'Abgleich')
    return fail(e)
  }
}

/** Eigentümer: alle Freigaben entfernen (Datei bleibt). Mitglied: nur lokal verlassen. */
export async function leave(share: ShoppingShare): Promise<ShareResult<null>> {
  if (share.role !== 'owner') return { ok: true, value: null }
  const m = await members(share)
  if (!m.ok) return m
  for (const x of m.value.filter((x) => x.role !== 'owner')) {
    const r = await removeMember(share, x.id)
    if (!r.ok) return r
  }
  return { ok: true, value: null }
}
