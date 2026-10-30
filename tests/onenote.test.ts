import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapPage, noteToOneNoteHtml, oneNoteHtmlToText } from '../src/main/onenote-map.ts'

test('OneNote-HTML → Text mit Aufgaben', () => {
  const html = '<html><head><title>Plan</title></head><body><div><p>Hallo &amp; willkommen</p><p data-tag="to-do">Angebot schicken</p><p data-tag="to-do:completed">Raum buchen</p><ul><li>Punkt A</li></ul><img src="x"/></div></body></html>'
  const t = oneNoteHtmlToText(html)
  assert.match(t, /Hallo & willkommen/)
  assert.match(t, /\[ \] Angebot schicken/)
  assert.match(t, /\[x\] Raum buchen/)
  assert.match(t, /- Punkt A/)
  assert.match(t, /\[Bild\]/)
  assert.doesNotMatch(t, /Plan/)
})

test('Tagwerk-Notiz → OneNote-HTML', () => {
  const h = noteToOneNoteHtml(
    { title: 'Kickoff <Q4>', body: 'Agenda\n- Budget\n- Team\n[ ] Folien bauen\n[x] Raum buchen', kind: 'meeting', decisions: 'Start am 1.12.', nextSteps: '', createdAt: '2026-10-30T10:00:00Z' },
    { project: 'Q4-Planung' }
  )
  assert.match(h, /<title>Kickoff &lt;Q4&gt;<\/title>/)
  assert.match(h, /<ul><li>Budget<\/li><li>Team<\/li><\/ul>/)
  assert.match(h, /<p data-tag="to-do">Folien bauen<\/p>/)
  assert.match(h, /<p data-tag="to-do:completed">Raum buchen<\/p>/)
  assert.match(h, /<h2>Entscheidungen<\/h2>/)
  assert.doesNotMatch(h, /Nächste Schritte/)
  assert.match(h, /Projekt: Q4-Planung/)
})

test('Seite abbilden', () => {
  const p = mapPage({ id: '1', title: ' ', parentSection: { id: 's', displayName: 'Uni' }, lastModifiedDateTime: '2026-10-30T10:00:00Z', links: { oneNoteClientUrl: { href: 'onenote:https://x' } } })
  assert.equal(p.title, 'Ohne Titel')
  assert.equal(p.section, 'Uni')
  assert.equal(p.clientUrl, 'onenote:https://x')
})
