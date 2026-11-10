# Arbeitsregeln für Tagwerk

- Mit Nils immer auf Deutsch kommunizieren.
- Updates sammeln: Neue Funktionen werden committet, aber erst mit dem nächsten großen Update veröffentlicht (Release-Workflow nur auf ausdrücklichen Wunsch).
- **ChatGPT-Briefing pflegen (`docs/CHATGPT.md`):** Nach jeder neuen oder geänderten Funktion
  - den passenden Abschnitt in „3. Funktionsumfang“ bzw. „4. Konten & Datenquellen“ anpassen,
  - die Funktion an den Eintrag „Noch nicht veröffentlicht …“ im Versionsverlauf anhängen (anlegen, falls er fehlt),
  - umgesetzte Punkte aus „8. Ideen-Speicher“ entfernen.
  Beim Release wandelt `scripts/update-briefing.mjs` (Schritt im Release-Workflow) den „Noch nicht veröffentlicht“-Eintrag automatisch in die neue Version um und setzt die Stand-Zeile.
- Keine E-Mail-Adresse von Nils in öffentliche Dateien schreiben (Repo ist öffentlich).
- **Web-Vorschau:** `npm run web` (lokal) bzw. automatisch nach jedem Push auf main unter https://nilsjonassell-ops.github.io/tagwerk/ (Workflow `web-preview.yml`). Die Browser-Brücke `src/web/bridge.ts` ersetzt den Hauptprozess: Daten im localStorage, Outlook/Apple als simulierte Testkonten. Neue Funktionen der Brücke (`TagwerkApi`) dort mit nachbilden.
- **Releases zurückhalten:** Ein versehentlich veröffentlichtes Release mit dem Workflow `release-visibility.yml` (action=draft) zurückziehen; beim großen Update mit action=publish freigeben. v2.0.0 (großes Update, 10.11.2026) ist auf GitHub veröffentlicht und als „Submission 2“ im Partner Center eingereicht; v1.8.0 bleibt ein nie veröffentlichter Entwurf (Inhalt steckt in 2.0.0). Store-Texte und Screenshots liegen unter `store/`.
