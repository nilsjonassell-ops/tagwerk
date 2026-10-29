// Neue Version veröffentlichen: npm run release -- patch|minor|major
// Erhöht die Version, lädt sie hoch und startet den Release-Build auf GitHub.
// GitHub baut daraus den Installer; die App bietet das Update dann an.
import { execSync } from 'node:child_process'

const kind = process.argv[2] ?? 'patch'
if (!['patch', 'minor', 'major'].includes(kind)) {
  console.error('Bitte patch, minor oder major angeben.')
  process.exit(1)
}
const run = (c) => execSync(c, { stdio: 'inherit' })
run('npm test')
run(`npm version ${kind} --no-git-tag-version`)
const { version } = JSON.parse(execSync('node -p "JSON.stringify(require(\'./package.json\'))"').toString())
run('git add package.json package-lock.json')
run(`git commit -m "Version ${version}"`)
run('git push')
// Tags legt electron-builder beim Veröffentlichen selbst an
run('gh workflow run release.yml --ref main')
