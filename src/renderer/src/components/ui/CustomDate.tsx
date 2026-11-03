// „Eigenes Datum“ unten in Später-/Wiedervorlage-Menüs.
import { useState } from 'react'

export function CustomDate({ onPick, time }: { onPick: (d: Date) => void; time: string }) {
  const [day, setDay] = useState('')
  return (
    <div className="menu-custom-date">
      <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && day && onPick(new Date(`${day}T${time}:00`))} aria-label="Eigenes Datum" />
      <button type="button" className="btn small" disabled={!day} onClick={() => onPick(new Date(`${day}T${time}:00`))}>
        OK
      </button>
    </div>
  )
}
