// Anbieter-Logos in einer einheitlichen Kachel: gleiche Größe, optisch ausgeglichen, im Dunkeln auf hellem Grund.
import { CalendarPlus } from 'lucide-react'
import type { ProviderKind } from '@shared/providers'

export function ProviderLogo({ kind, size = 36 }: { kind: ProviderKind; size?: number }) {
  return (
    <span className={`provider-logo pl-${kind}`} style={{ width: size, height: size }} aria-hidden="true">
      {kind === 'google' && (
        <svg viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.6a4.8 4.8 0 0 1-2.1 3.2v2.6h3.4c2-1.8 3.1-4.5 3.1-7.6z" />
          <path fill="#34A853" d="M12 22c2.8 0 5.2-.9 6.9-2.5l-3.4-2.6c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.7v2.7A10 10 0 0 0 12 22z" />
          <path fill="#FBBC05" d="M6.2 13.6a6 6 0 0 1 0-3.9V7H2.7a10 10 0 0 0 0 9l3.5-2.4z" />
          <path fill="#EA4335" d="M12 5.9c1.5 0 2.9.5 4 1.5l3-3A10 10 0 0 0 2.7 7l3.5 2.7C7 7.7 9.3 5.9 12 5.9z" />
        </svg>
      )}
      {kind === 'microsoft' && (
        <svg viewBox="0 0 24 24">
          <rect x="2" y="2" width="9.5" height="9.5" fill="#f25022" />
          <rect x="12.5" y="2" width="9.5" height="9.5" fill="#7fba00" />
          <rect x="2" y="12.5" width="9.5" height="9.5" fill="#00a4ef" />
          <rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#ffb900" />
        </svg>
      )}
      {kind === 'apple' && (
        // Apple-Glyphe optisch zentriert (das Blatt oben zieht sonst nach oben)
        <svg viewBox="0 0 24 24" fill="#1d1d1f">
          <path transform="translate(0 0.6)" d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.8-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.9-1.1-2.9-4.3zM13.9 5.2c.7-.9 1.2-2 1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.2.1 2.3-.6 3.1-1.5z" />
        </svg>
      )}
      {kind === 'ics' && <CalendarPlus />}
    </span>
  )
}
