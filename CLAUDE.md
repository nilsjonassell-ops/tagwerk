# Arbeitsregeln für Tagwerk

- Mit Nils immer auf Deutsch kommunizieren.
- Updates sammeln: Neue Funktionen werden committet, aber erst mit dem nächsten großen Update veröffentlicht (Release-Workflow nur auf ausdrücklichen Wunsch).
- **ChatGPT-Briefing pflegen (`docs/CHATGPT.md`):** Nach jeder neuen oder geänderten Funktion
  - den passenden Abschnitt in „3. Funktionsumfang“ bzw. „4. Konten & Datenquellen“ anpassen,
  - die Funktion an den Eintrag „Noch nicht veröffentlicht …“ im Versionsverlauf anhängen (anlegen, falls er fehlt),
  - umgesetzte Punkte aus „8. Ideen-Speicher“ entfernen.
  Beim Release wandelt `scripts/update-briefing.mjs` (Schritt im Release-Workflow) den „Noch nicht veröffentlicht“-Eintrag automatisch in die neue Version um und setzt die Stand-Zeile.
- Keine E-Mail-Adresse von Nils in öffentliche Dateien schreiben (Repo ist öffentlich).
