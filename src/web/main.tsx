// Einstieg der Web-Vorschau: Browser-Brücke einsetzen, dann die normale Oberfläche starten.
import { webApi } from './bridge'
;(window as unknown as { tagwerk: typeof webApi }).tagwerk = webApi
import('./banner')
import('../renderer/src/main')
