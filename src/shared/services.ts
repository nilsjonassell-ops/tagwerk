// Externe Dienste, mit denen Tagwerk sprechen kann – für die Datenschutz-Seite und Lizenzhinweise.
// Jeder Dienst ist optional; Daten fließen nur, wenn der Nutzer ihn verbindet bzw. einschaltet.

export interface ExternalService {
  id: string
  name: string
  /** Was übertragen wird – kurz, in Alltagssprache */
  what: string
  privacy: string
  /** Pflichthinweis zur Lizenz, falls die Daten unter einer Lizenz stehen */
  license?: { text: string; url: string }
}

export const PRIVACY_POLICY_URL = 'https://github.com/nilsjonassell-ops/tagwerk/blob/main/PRIVACY.md'

export const OPEN_METEO = {
  url: 'https://open-meteo.com/',
  license: { text: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' }
}

export const SERVICES: ExternalService[] = [
  { id: 'google', name: 'Google', what: 'Gmail und Google Kalender, wenn du dein Google-Konto verbindest', privacy: 'https://policies.google.com/privacy' },
  { id: 'microsoft', name: 'Microsoft', what: 'Outlook, OneNote, Cloud-Speicher und geteilte Einkaufslisten (OneDrive), wenn du dein Microsoft-Konto verbindest', privacy: 'https://privacy.microsoft.com/de-de/privacystatement' },
  { id: 'apple', name: 'Apple', what: 'iCloud-Kalender, wenn du deinen Apple Kalender verbindest', privacy: 'https://www.apple.com/de/legal/privacy/' },
  { id: 'wikibooks', name: 'Wikimedia (Wikibooks-Kochbuch)', what: 'Nur dein Suchbegriff bzw. das gewählte Rezept, wenn du Rezepte suchst', privacy: 'https://foundation.wikimedia.org/wiki/Policy:Privacy_policy/de', license: { text: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.de' } },
  { id: 'open-meteo', name: 'Open-Meteo', what: 'Nur der eingetragene Ort, wenn Wetter eingeschaltet ist', privacy: 'https://open-meteo.com/en/terms#privacy', license: OPEN_METEO.license },
  { id: 'anthropic', name: 'Anthropic (Claude)', what: 'Nur deine Anfrage, wenn du Claude mit eigenem Schlüssel einschaltest', privacy: 'https://www.anthropic.com/legal/privacy' }
]
