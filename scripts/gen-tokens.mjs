// npm run tokens – schreibt src/renderer/src/styles/tokens.css
import { writeFileSync } from 'node:fs'
import { renderTokens } from './tokens-css.ts'
writeFileSync(new URL('../src/renderer/src/styles/tokens.css', import.meta.url), renderTokens())
console.log('tokens.css geschrieben')
