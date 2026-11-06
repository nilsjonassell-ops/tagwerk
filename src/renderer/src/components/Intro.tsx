// Startanimation: das echte App-Symbol (Sonne über dem Horizont auf der Petrol-Kachel).
// Ruhig und präzise: Kachel setzt sich, Zeichen baut sich auf, Schriftzug erscheint –
// dann fliegt die Kachel an ihren Platz in der Seitenleiste und die App wird frei.
// Überspringen mit Klick oder Taste; bei reduzierter Bewegung entfällt sie ganz.

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'

/** Mindestdauer, damit das Zeichen fertig ist, bevor die App kommt */
export const INTRO_MIN_MS = 1300
/** Übergang in die App */
export const INTRO_LEAVE_MS = 560
const RAYS = [-60, -30, 0, 30, 60]

export function Intro() {
  const ready = useStore((s) => s.ready)
  // armed = erstes Bild steht schon da, läuft aber noch nicht (vor dem Ausblenden ins Infobereich-Symbol)
  const [phase, setPhase] = useState<'armed' | 'play' | 'leave' | 'gone'>(() => (reduced() ? 'gone' : 'play'))
  const [minDone, setMinDone] = useState(false)
  const [run, setRun] = useState(0)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const tile = useRef<HTMLDivElement>(null)

  // Beim erneuten Öffnen aus dem Infobereich noch einmal abspielen
  useEffect(
    () =>
      window.tagwerk.app.onCommand((cmd) => {
        if (reduced()) return
        if (cmd === 'arm-intro') {
          setMinDone(false)
          setPhase('armed')
          setRun((n) => n + 1)
        } else if (cmd === 'replay-intro') {
          setMinDone(false)
          if (phaseRef.current !== 'armed') setRun((n) => n + 1)
          setPhase('play')
        }
      }),
    []
  )

  useEffect(() => {
    if (phase !== 'play') return
    const t = setTimeout(() => setMinDone(true), INTRO_MIN_MS)
    return () => clearTimeout(t)
  }, [phase, run])

  useEffect(() => {
    if (phase === 'play' && minDone && ready) setPhase('leave')
  }, [phase, minDone, ready])

  // Überspringen: Taste oder Klick, sobald die Daten da sind
  useEffect(() => {
    if (phase !== 'play') return
    const onKey = () => ready && setPhase('leave')
    window.addEventListener('keydown', onKey, { once: true })
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, ready])

  // Übergang: Kachel fliegt zum Logo in der Seitenleiste (falls sichtbar), sonst sanft nach oben weg
  useEffect(() => {
    if (phase !== 'leave') return
    const el = tile.current
    const target = document.querySelector('.sidebar .brand-mark')?.getBoundingClientRect()
    if (el && target && target.width > 0) {
      const from = el.getBoundingClientRect()
      const dx = target.left + target.width / 2 - (from.left + from.width / 2)
      const dy = target.top + target.height / 2 - (from.top + from.height / 2)
      const s = (target.width * 1.15) / from.width
      el.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1, borderRadius: '24px' },
          { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.9, offset: 0.8 },
          { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0 }
        ],
        { duration: INTRO_LEAVE_MS, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' }
      )
    }
    document.documentElement.classList.add('intro-reveal')
    const t = setTimeout(() => {
      setPhase('gone')
      document.documentElement.classList.remove('intro-reveal')
    }, INTRO_LEAVE_MS + 40)
    return () => clearTimeout(t)
  }, [phase])

  if (phase === 'gone') return null
  const skip = () => ready && phase === 'play' && setPhase('leave')

  return (
    <div key={run} className={`intro ${phase === 'armed' ? 'armed' : ''} ${phase === 'leave' ? 'leaving' : ''} ${minDone && !ready ? 'waiting' : ''}`} onClick={skip} aria-hidden="true">
      <div className="intro-stage">
        <div className="intro-tile" ref={tile}>
          <svg className="intro-mark" viewBox="0 0 120 120" width="120" height="120">
            <defs>
              <clipPath id="ig-sky">
                <rect x="0" y="0" width="120" height="74" />
              </clipPath>
            </defs>
            {/* Strahlen – laufen nacheinander nach außen */}
            {RAYS.map((deg, i) => (
              <line key={deg} x1="60" y1="36" x2="60" y2="27" className="i-ray" style={{ animationDelay: `${520 + i * 45}ms` }} transform={`rotate(${deg} 60 72)`} />
            ))}
            {/* Sonne geht hinter dem Horizont auf */}
            <g clipPath="url(#ig-sky)">
              <path d="M38 74 a22 22 0 0 1 44 0 z" className="i-sun" />
            </g>
            {/* Horizont und zweite Linie ziehen sich von der Mitte auf */}
            <rect x="24" y="76" width="72" height="6" rx="3" className="i-horizon" />
            <rect x="38" y="88" width="44" height="5" rx="2.5" className="i-line" />
          </svg>
        </div>
        <div className="intro-word">Tagwerk</div>
        <div className="intro-tag">Dein Tag. Klar geordnet.</div>
        <div className="intro-progress" role="presentation">
          <span />
        </div>
      </div>
    </div>
  )
}

function reduced() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduced'
  } catch {
    return false
  }
}
