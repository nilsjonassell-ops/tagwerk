// Neue Version veröffentlichen: npm run release -- patch|minor|major
// Erhöht die Version, legt einen Git-Tag an und lädt beides hoch.
// GitHub baut daraus den Installer; die App bietet das Update dann an.
import { execSync } from 'node:child_process'

const kind = process.argv[2] ?? 'patch'
if (!['patch', 'minor', 'major'].includes(kind)) {
  console.error('Bitte patch, minor oder major angeben.')
  process.exit(1)
}
const run = (c) => execSync(c, { stdio: 'inherit' })
run('npm test')
run(`npm version ${kind} -m "Version %s"`)
run('git push --follow-tags')
