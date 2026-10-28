import { useEffect, useState } from 'react'
import { useStore, useConfirm } from '@/lib/store'
import { Dialog } from './ui'

export function ConfirmHost() {
  const { state, set } = useConfirm()
  const [checked, setChecked] = useState(false)
  useEffect(() => setChecked(state?.option?.initial ?? false), [state])
  if (!state) return null
  const close = (ok: boolean) => {
    state.resolve(ok, checked)
    set(null)
  }
  return (
    <Dialog
      title={state.title}
      onClose={() => close(false)}
      footer={
        <>
          <button className="btn" onClick={() => close(false)}>
            Abbrechen
          </button>
          <button className={`btn ${state.danger ? 'danger' : 'primary'}`} onClick={() => close(true)} data-autofocus>
            {state.confirmLabel}
          </button>
        </>
      }
    >
      {state.body && <p>{state.body}</p>}
      {state.option && (
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" className="box-check" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> {state.option.label}
        </label>
      )}
    </Dialog>
  )
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone === 'error' ? 'error' : ''}`}>
          <span className="grow">{t.text}</span>
          {t.undo && (
            <button
              onClick={() => {
                t.undo?.()
                dismiss(t.id)
              }}
            >
              Rückgängig
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
