// Konten → Übersicht: alle tatsächlich unterstützten Anbieter nach E-Mail, Kalender, Notizen & Sicherung,
// mit Zustand (Symbol + Text) und genau einer passenden Aktion.
import { AlertTriangle, Check, CircleSlash, Clock, Loader2, Minus } from 'lucide-react'
import { GROUP_LABEL, providerRows, type ProviderGroup, type ProviderRow, type ProviderState } from '@shared/providers'
import { useStore } from '@/lib/store'
import { useAccounts } from '@/lib/accounts'
import { ProviderLogo } from './ProviderLogo'

const ICON: Record<ProviderState, typeof Check> = { connected: Check, disconnected: Minus, expired: Clock, error: AlertTriangle, syncing: Loader2, unsupported: CircleSlash, available: Check }
const ACTION_LABEL = { connect: 'Verbinden', manage: 'Verwalten', reconnect: 'Neu anmelden', import: 'Datei importieren' } as const

/** Zum Abschnitt mit den Kontoeinstellungen springen und ihn kurz hervorheben */
function reveal(section: string) {
  const el = document.getElementById(`acc-${section}`)
  if (!el) return
  el.scrollIntoView({ behavior: document.documentElement.dataset.motion === 'reduced' ? 'auto' : 'smooth', block: 'start' })
  el.classList.remove('flash')
  void el.offsetWidth
  el.classList.add('flash')
  setTimeout(() => el.querySelector<HTMLElement>('.btn.primary, .btn, input, [role="switch"]')?.focus({ preventScroll: true }), 350)
}

export function ProvidersOverview({ onImport, importing }: { onImport: () => void; importing: boolean }) {
  const google = useStore((s) => s.google)
  const googleSync = useStore((s) => s.googleSync)
  const { ms, icloud, outlookSync, icloudSync, cloud } = useAccounts()
  const rows = providerRows({ google, googleSync, ms, outlookSync, icloud, icloudSync, cloud })
  const groups = [...new Set(rows.map((r) => r.group))] as ProviderGroup[]
  const run = (r: ProviderRow) => (r.action === 'import' ? onImport() : r.section && reveal(r.section))
  return (
    <div className="providers">
      {groups.map((g) => (
        <section key={g} aria-label={GROUP_LABEL[g]}>
          <div className="settings-group">{GROUP_LABEL[g]}</div>
          <ul className="provider-list">
            {rows
              .filter((r) => r.group === g)
              .map((r) => {
                const Icon = ICON[r.state]
                return (
                  <li key={r.id} className={`provider-row st-${r.state}`} data-provider={r.id}>
                    <ProviderLogo kind={r.kind} />
                    <div className="pr-text">
                      <b>{r.name}</b>
                      {r.detail && <span>{r.detail}</span>}
                    </div>
                    <span className={`pr-state st-${r.state}`}>
                      <Icon className={r.state === 'syncing' ? 'spin' : undefined} aria-hidden="true" />
                      {r.stateLabel}
                    </span>
                    <span className="pr-action">
                      {r.action && (
                        <button type="button" className={`btn small ${r.action === 'connect' || r.action === 'reconnect' ? 'primary' : ''}`} onClick={() => run(r)} disabled={r.action === 'import' && importing} aria-label={`${r.name}: ${ACTION_LABEL[r.action]}`}>
                          {r.action === 'import' && importing ? <Loader2 className="spin" aria-hidden="true" /> : null}
                          {ACTION_LABEL[r.action]}
                        </button>
                      )}
                    </span>
                  </li>
                )
              })}
          </ul>
        </section>
      ))}
    </div>
  )
}
