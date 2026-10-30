// Reine Umwandlungen zwischen OneNote (Microsoft Graph) und Tagwerk.
// Keine Electron-Abhängigkeiten – direkt testbar.

import type { Note, OneNoteSection, OneNotePage } from '../shared/types.ts'
import { htmlToText } from './google-map.ts'

export interface GSection {
  id: string
  displayName?: string
  parentNotebook?: { id?: string; displayName?: string }
  links?: { oneNoteWebUrl?: { href?: string } }
}

export interface GPage {
  id: string
  title?: string
  createdDateTime?: string
  lastModifiedDateTime?: string
  parentSection?: { id?: string; displayName?: string }
  links?: { oneNoteClientUrl?: { href?: string }; oneNoteWebUrl?: { href?: string } }
}

export function mapSection(s: GSection): OneNoteSection {
  return {
    id: s.id,
    name: s.displayName?.trim() || 'Abschnitt',
    notebookId: s.parentNotebook?.id ?? '',
    notebook: s.parentNotebook?.displayName?.trim() || 'Notizbuch',
    webUrl: s.links?.oneNoteWebUrl?.href
  }
}

export function mapPage(p: GPage): OneNotePage {
  return {
    id: p.id,
    title: p.title?.trim() || 'Ohne Titel',
    sectionId: p.parentSection?.id ?? '',
    section: p.parentSection?.displayName?.trim() || '',
    created: p.createdDateTime ?? p.lastModifiedDateTime ?? '',
    modified: p.lastModifiedDateTime ?? p.createdDateTime ?? '',
    webUrl: p.links?.oneNoteWebUrl?.href,
    clientUrl: p.links?.oneNoteClientUrl?.href
  }
}

/** OneNote-Seiteninhalt (HTML) → lesbarer Text. Aufgaben-Häkchen werden zu [ ] / [x]. */
export function oneNoteHtmlToText(html: string): string {
  const withTags = html
    // Titel steht schon in der Kopfzeile
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<(p|li|div)([^>]*?)data-tag="([^"]*)"([^>]*)>/gi, (_m, tag, a, tags: string, b) => {
      const list = tags.split(',').map((t) => t.trim())
      const mark = list.includes('to-do:completed') ? '[x] ' : list.includes('to-do') ? '[ ] ' : ''
      return `<${tag}${a}${b}>${mark}`
    })
    .replace(/<img[^>]*>/gi, '[Bild]')
  return htmlToText(withTags)
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Tagwerk-Notiz → OneNote-Seite (HTML, wie es die Graph-API erwartet).
 * Zeilen mit „- “ werden Aufzählungen, „[ ]“ / „[x]“ werden OneNote-Aufgaben.
 */
export function noteToOneNoteHtml(note: Pick<Note, 'title' | 'body' | 'kind' | 'decisions' | 'nextSteps' | 'createdAt'>, meta: { event?: string; project?: string } = {}): string {
  const block = (text: string) => {
    const out: string[] = []
    let list: string[] = []
    const flush = () => {
      if (list.length) out.push(`<ul>${list.join('')}</ul>`)
      list = []
    }
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trimEnd()
      const todo = line.match(/^\s*(?:[-*]\s*)?\[( |x|X)\]\s+(.*)$/)
      const bullet = line.match(/^\s*[-*•]\s+(.*)$/)
      if (todo) {
        flush()
        out.push(`<p data-tag="${todo[1] === ' ' ? 'to-do' : 'to-do:completed'}">${esc(todo[2])}</p>`)
      } else if (bullet) list.push(`<li>${esc(bullet[1])}</li>`)
      else {
        flush()
        out.push(line.trim() ? `<p>${esc(line)}</p>` : '<br />')
      }
    }
    flush()
    return out.join('\n')
  }
  const info = [meta.event && `Termin: ${meta.event}`, meta.project && `Projekt: ${meta.project}`].filter(Boolean).join(' · ')
  const parts = [
    info ? `<p style="color:#6b7280;font-size:9pt">${esc(info)}</p>` : '',
    block(note.body || ''),
    note.kind === 'meeting' && note.decisions?.trim() ? `<h2>Entscheidungen</h2>\n${block(note.decisions)}` : '',
    note.kind === 'meeting' && note.nextSteps?.trim() ? `<h2>Nächste Schritte</h2>\n${block(note.nextSteps)}` : '',
    '<p style="color:#9ca3af;font-size:8pt">Aus Tagwerk gespeichert</p>'
  ].filter(Boolean)
  return `<!DOCTYPE html>
<html lang="de-DE">
<head>
<title>${esc(note.title || 'Notiz aus Tagwerk')}</title>
<meta name="created" content="${esc(note.createdAt)}" />
</head>
<body>
${parts.join('\n')}
</body>
</html>`
}
