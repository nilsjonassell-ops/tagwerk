// Teilen einer Einkaufsliste über OneDrive: nur eingeladene Microsoft-Konten, kein öffentlicher Link.
import { useEffect, useState } from 'react'
import { Copy, LogIn, Mail, ShieldCheck, Trash2, UserMinus, Users } from 'lucide-react'
import { joinCode } from '@shared/shopping-share'
import type { ShareMember, ShoppingList } from '@shared/types'
import { confirm, useStore } from '@/lib/store'
import { useAccounts } from '@/lib/accounts'
import { dropList, itemsOf, setListShare } from '@/lib/meals'
import { syncList } from '@/lib/shoppingSync'
import { Dialog } from '@/components/ui'

/** Microsoft-Zugriff für geteilte Listen erweitern (bestehende Freigaben bleiben) */
function useShareAccess() {
  const ms = useAccounts((s) => s.ms)
  const refresh = useAccounts((s) => s.refresh)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const grant = async () => {
    setBusy(true)
    setError(null)
    const r = await window.tagwerk.microsoft.connect({ notes: ms.caps.notes, mail: ms.caps.mail, calendar: ms.caps.calendar, sync: ms.caps.sync, share: true })
    await refresh()
    setBusy(false)
    if (!r.ok) setError(r.error ?? 'Die Anmeldung wurde nicht abgeschlossen.')
  }
  return { ready: ms.connected && !!ms.caps.share, connected: ms.connected, email: ms.email, grant, busy, error }
}

function AccessNeeded({ access, what }: { access: ReturnType<typeof useShareAccess>; what: string }) {
  return (
    <div className="share-access">
      <p>
        Für {what} braucht Tagwerk Zugriff auf deine OneDrive-Dateien. Tagwerk nutzt ihn nur für die Einkaufslisten-Dateien im Ordner „Tagwerk Geteilt“ und für Listen, die mit dir geteilt wurden.
      </p>
      <p className="muted fine">{access.connected ? `Angemeldet als ${access.email}. Microsoft fragt einmal nach der zusätzlichen Berechtigung.` : 'Du meldest dich mit deinem Microsoft-Konto an (outlook.de, hotmail, live).'}</p>
      {access.error && (
        <p className="error-text" role="alert">
          {access.error}
        </p>
      )}
      <button className="btn primary" onClick={access.grant} disabled={access.busy}>
        <LogIn /> {access.busy ? 'Warte auf Microsoft …' : access.connected ? 'Zugriff erlauben' : 'Mit Microsoft anmelden'}
      </button>
    </div>
  )
}

export function ShareDialog({ list, onClose }: { list: ShoppingList; onClose: () => void }) {
  const access = useShareAccess()
  const toast = useStore((s) => s.toast)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emails, setEmails] = useState('')
  const [members, setMembers] = useState<ShareMember[] | null>(null)
  const share = list.share
  const owner = share?.role === 'owner'

  useEffect(() => {
    if (!share || !access.ready) return
    let alive = true
    void window.tagwerk.shopping.members(share).then((r) => alive && (r.ok ? setMembers(r.value) : setError(r.error)))
    return () => {
      alive = false
    }
  }, [share?.itemId, access.ready]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setBusy(true)
    setError(null)
    const r = await window.tagwerk.shopping.create(list.name, itemsOf(useStore.getState().data, list.id))
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setListShare(list.id, r.value)
    const fresh = useStore.getState().data.shoppingLists?.find((l) => l.id === list.id)
    if (fresh) void syncList(fresh)
    const m = await window.tagwerk.shopping.members(r.value)
    if (m.ok) setMembers(m.value)
  }
  const invite = async () => {
    if (!share) return
    setBusy(true)
    setError(null)
    const r = await window.tagwerk.shopping.invite(share, emails.split(/[,;\s]+/).filter(Boolean))
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setMembers(r.value)
    setEmails('')
    toast('Einladung verschickt – Microsoft schickt eine E-Mail mit dem Link.')
  }
  const remove = async (m: ShareMember) => {
    if (!share) return
    const ok = await confirm({ title: `Zugriff für ${m.name} entfernen?`, body: `${m.name} kann die Liste danach nicht mehr sehen oder ändern. Eine Kopie, die schon auf deren PC liegt, wird nicht mehr aktualisiert.`, confirmLabel: 'Entfernen', danger: true })
    if (!ok) return
    const r = await window.tagwerk.shopping.removeMember(share, m.id)
    if (!r.ok) return setError(r.error)
    setMembers((ms) => (ms ?? []).filter((x) => x.id !== m.id))
  }
  const stop = async () => {
    if (!share) return
    const ok = await confirm(
      owner
        ? { title: 'Teilen beenden?', body: 'Alle eingeladenen Personen verlieren den Zugriff. Die Liste bleibt bei dir erhalten.', confirmLabel: 'Teilen beenden', danger: true }
        : { title: 'Liste verlassen?', body: 'Die Liste verschwindet von deinem PC. Die anderen behalten sie. Du kannst später mit der Einladung wieder beitreten.', confirmLabel: 'Verlassen', danger: true }
    )
    if (!ok) return
    const r = await window.tagwerk.shopping.leave(share)
    if (!r.ok) return setError(r.error)
    if (owner) {
      // Einträge bleiben lokal; Abgleichsstand zurücksetzen
      useStore.getState().mutate((d) => ({ ...d, shoppingItems: (d.shoppingItems ?? []).map((i) => (i.listId === list.id ? { ...i, syncedAt: undefined } : i)) }))
      setListShare(list.id, undefined)
    } else dropList(list.id)
    onClose()
  }
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('Beitrittscode kopiert')
    } catch {
      toast('Kopieren nicht möglich – bitte den Code markieren und kopieren.', { tone: 'error' })
    }
  }

  return (
    <Dialog title={share ? `„${list.name}“ – geteilt` : `„${list.name}“ teilen`} size="md" onClose={onClose} footer={<button className="btn" onClick={onClose}>Schließen</button>}>
      <p className="share-promise">
        <ShieldCheck aria-hidden="true" /> Nur Personen, die du per E-Mail einlädst und die sich mit diesem Microsoft-Konto anmelden, haben Zugriff. Es gibt keinen öffentlichen Link.
      </p>
      {!access.ready ? (
        <AccessNeeded access={access} what="geteilte Listen" />
      ) : !share ? (
        <>
          <p>Die Liste wird als Datei in deinem OneDrive (Ordner „Tagwerk Geteilt“) gespeichert. Danach lädst du Personen ein; Änderungen sehen alle nach wenigen Sekunden.</p>
          <p className="muted fine">Wer mitmacht, braucht Tagwerk und ein Microsoft-Konto. Die OneDrive-Nutzung ist im kostenlosen Speicher enthalten; es gelten die Bedingungen und Limits von Microsoft.</p>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button className="btn primary" onClick={start} disabled={busy}>
            <Users /> {busy ? 'Wird angelegt …' : 'Liste teilen'}
          </button>
        </>
      ) : (
        <>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          {owner && (
            <form
              className="invite-row"
              onSubmit={(e) => {
                e.preventDefault()
                void invite()
              }}
            >
              <input className="input" type="text" inputMode="email" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="E-Mail-Adresse(n), mit Komma getrennt" aria-label="E-Mail-Adressen zum Einladen" />
              <button className="btn primary" type="submit" disabled={busy || !emails.trim()}>
                <Mail /> Einladen
              </button>
            </form>
          )}
          <h3 className="share-sub">Zugriff haben</h3>
          {members === null ? (
            <p className="muted">Wird geladen …</p>
          ) : (
            <ul className="member-list">
              {members.map((m) => (
                <li key={m.id}>
                  <span className="who">
                    <b>{m.name}</b>
                    {m.email && m.email !== m.name && <span className="muted"> {m.email}</span>}
                  </span>
                  <span className="tag">{m.role === 'owner' ? 'Eigentümer' : m.pending ? 'Eingeladen' : m.role === 'write' ? 'Kann bearbeiten' : 'Nur lesen'}</span>
                  {owner && m.role !== 'owner' && (
                    <button className="btn small icon-btn ghost" onClick={() => void remove(m)} aria-label={`Zugriff für ${m.name} entfernen`}>
                      <UserMinus />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {owner && (
            <div className="join-code">
              <span>Falls die Einladungs-Mail nicht ankommt, gib eingeladenen Personen diesen Beitrittscode (ohne Einladung nutzlos):</span>
              <code>{joinCode(share)}</code>
              <button className="btn small" onClick={() => void copy(joinCode(share))}>
                <Copy /> Kopieren
              </button>
            </div>
          )}
          <div className="step-actions">
            <span className="spacer" />
            <button className="btn ghost danger" onClick={() => void stop()}>
              <Trash2 /> {owner ? 'Teilen beenden' : 'Liste verlassen'}
            </button>
          </div>
        </>
      )}
    </Dialog>
  )
}

export function JoinDialog({ onClose, onJoined }: { onClose: () => void; onJoined: (listId: string) => void }) {
  const access = useShareAccess()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = async () => {
    setBusy(true)
    setError(null)
    const r = await window.tagwerk.shopping.join(input)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    const existing = (useStore.getState().data.shoppingLists ?? []).find((l) => l.share?.itemId === r.value.share.itemId)
    if (existing) {
      onJoined(existing.id)
      return onClose()
    }
    const id = `list-${Date.now().toString(36)}`
    useStore.getState().mutate((d) => ({ ...d, shoppingLists: [...(d.shoppingLists ?? []), { id, name: r.value.name, createdAt: new Date().toISOString(), share: r.value.share }] }), { toast: `„${r.value.name}“ beigetreten` })
    const l = useStore.getState().data.shoppingLists?.find((x) => x.id === id)
    if (l) void syncList(l)
    onJoined(id)
    onClose()
  }
  return (
    <Dialog
      title="Geteilter Liste beitreten"
      size="md"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          {access.ready && (
            <button className="btn primary" onClick={() => void go()} disabled={busy || !input.trim()}>
              {busy ? 'Wird geöffnet …' : 'Beitreten'}
            </button>
          )}
        </>
      }
    >
      {!access.ready ? (
        <AccessNeeded access={access} what="das Öffnen geteilter Listen" />
      ) : (
        <>
          <p>Füge den Link aus der Einladungs-Mail von Microsoft oder den Beitrittscode (beginnt mit „TW1-“) ein.</p>
          <input className="input" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && input.trim() && void go()} placeholder="https://1drv.ms/… oder TW1-…" aria-label="Einladungslink oder Beitrittscode" autoFocus />
          <p className="muted fine">Klappt nur, wenn du mit genau dem Microsoft-Konto eingeladen wurdest, mit dem du hier angemeldet bist ({access.email}).</p>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </Dialog>
  )
}
