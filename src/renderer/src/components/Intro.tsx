// Startanimation: Das Tagwerk-Logo (Sonne über dem Horizont) baut sich auf –
// Umlaufring zeichnet sich, der Horizont zieht sich auf, die Sonne geht auf,
// Strahlen drehen sich ein – danach öffnet sich die App darunter.

import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'

const MIN_MS = 2300
const RAYS = 12

export function Intro() {
  const ready = useStore((s) => s.ready)
  const [phase, setPhase] = useState<'play' | 'leave' | 'gone'>(() => (reduced() ? 'gone' : 'play'))
  const [minDone, setMinDone] = useState(false)

  useEffect(() => {
    if (phase !== 'play') return
    const t = setTimeout(() => setMinDone(true), MIN_MS)
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    if (phase === 'play' && minDone && ready) setPhase('leave')
  }, [phase, minDone, ready])

  useEffect(() => {
    if (phase !== 'leave') return
    const t = setTimeout(() => setPhase('gone'), 750)
    return () => clearTimeout(t)
  }, [phase])

  if (phase === 'gone') return null
  const skip = () => ready && setPhase('leave')

  return (
    <div className={`intro ${phase === 'leave' ? 'leaving' : ''} ${minDone && !ready ? 'waiting' : ''}`} onClick={skip} aria-hidden="true">
      <div className="intro-glow" />
      <div className="intro-stage">
        <svg className="intro-logo" viewBox="0 0 200 200" width="200" height="200">
          <defs>
            <linearGradient id="ig-main" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#4d7cff" />
              <stop offset="52%" stopColor="#8b6dff" />
              <stop offset="100%" stopColor="#ff6fae" />
            </linearGradient>
            <linearGradient id="ig-sun" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff8ac0" />
              <stop offset="55%" stopColor="#9a6bff" />
              <stop offset="100%" stopColor="#5a7dff" />
            </linearGradient>
            {/* eigene Koordinaten, sonst verschwindet der Verlauf auf senkrechten Linien */}
            <linearGradient id="ig-ray" gradientUnits="userSpaceOnUse" x1="30" y1="40" x2="170" y2="130">
              <stop offset="0%" stopColor="#4d7cff" />
              <stop offset="52%" stopColor="#8b6dff" />
              <stop offset="100%" stopColor="#ff6fae" />
            </linearGradient>
            <radialGradient id="ig-halo" cx="0.5" cy="0.62" r="0.5">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="40%" stopColor="#b9a6ff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#b9a6ff" stopOpacity="0" />
            </radialGradient>
            <clipPath id="ig-sky">
              <rect x="0" y="0" width="200" height="126" />
            </clipPath>
            <filter id="ig-soft" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          {/* Umlaufring */}
          <g className="i-orbit">
            <circle cx="100" cy="100" r="90" fill="none" stroke="url(#ig-main)" strokeWidth="2.2" strokeLinecap="round" pathLength="100" className="i-orbit-line" />
            <circle cx="100" cy="10" r="3.2" fill="#ff6fae" className="i-orbit-dot" />
          </g>

          {/* Halo hinter der Sonne */}
          <circle cx="100" cy="118" r="70" fill="url(#ig-halo)" className="i-halo" />

          {/* Strahlen – drehen sich ein, nur über dem Horizont sichtbar */}
          <g clipPath="url(#ig-sky)">
            <g className="i-rays">
              {Array.from({ length: RAYS }, (_, i) => (
                <line
                  key={i}
                  x1="100"
                  y1="54"
                  x2="100"
                  y2="40"
                  stroke="url(#ig-ray)"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  transform={`rotate(${(360 / RAYS) * i} 100 118)`}
                  style={{ animationDelay: `${0.75 + i * 0.03}s` }}
                  className="i-ray"
                />
              ))}
            </g>

            {/* Sonne geht auf */}
            <g className="i-sun">
              <path d="M54 124 a46 46 0 0 1 92 0 z" fill="url(#ig-sun)" filter="url(#ig-soft)" opacity="0.55" />
              <path d="M54 124 a46 46 0 0 1 92 0 z" fill="url(#ig-sun)" />
              <path d="M66 118 a34 34 0 0 1 34 -34" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" className="i-shine" />
            </g>
          </g>

          {/* Horizont */}
          <rect x="26" y="128" width="148" height="12" rx="6" fill="url(#ig-main)" className="i-horizon" />
          <rect x="26" y="128" width="148" height="12" rx="6" fill="#fff" className="i-horizon-flash" />
        </svg>

        <div className="intro-word">
          {'Tagwerk'.split('').map((ch, i) => (
            <span key={i} style={{ animationDelay: `${1.05 + i * 0.045}s` }}>
              {ch}
            </span>
          ))}
        </div>
        <div className="intro-tag">Dein Tag. Klar geordnet.</div>
      </div>
    </div>
  )
}

function reduced() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
