// Aktualisiert docs/CHATGPT.md beim Release: Stand-Zeile und Versionsverlauf.
// Aus dem Eintrag „Noch nicht veröffentlicht …“ wird der Eintrag der neuen Version.
import { readFileSync, writeFileSync } from 'node:fs'

const file = new URL('../docs/CHATGPT.md', import.meta.url)
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const date = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' })
let md = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')

md = md.replace(/<!--STAND-->[\s\S]*?<!--\/STAND-->/, `<!--STAND-->Version ${version} (im Microsoft Store) · aktualisiert am ${date}<!--/STAND-->`)

md = md.replace(/<!--VERSIONEN-->([\s\S]*?)<!--\/VERSIONEN-->/, (_m, list) => {
  if (new RegExp(`\\*\\*${version.replace(/\./g, '\\.')}\\*\\*`).test(list)) return `<!--VERSIONEN-->${list}<!--/VERSIONEN-->`
  // Windows-Checkout: Zeilenenden können \r\n sein
  const pending = /- \*\*Noch nicht veröffentlicht[^*]*\*\*\s*([^\r\n]+)\r?\n/
  if (pending.test(list)) list = list.replace(pending, (_p, items) => `- **${version}** (${date}) – ${items.trim()}\n`)
  else list = list.replace(/^\n?/, `\n- **${version}** (${date}) – Wartungs-Update\n`)
  return `<!--VERSIONEN-->${list}<!--/VERSIONEN-->`
})

writeFileSync(file, md)
console.log(`Briefing auf ${version} aktualisiert`)
