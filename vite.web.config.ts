// Web-Vorschau: dieselbe Oberfläche wie die App, im Browser mit Beispieldaten (GitHub Pages).
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const version = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version
let commit = ''
try {
  commit = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  /* ohne git */
}

export default defineConfig({
  root: resolve(__dirname, 'src/web'),
  base: './',
  define: { __BUILD__: JSON.stringify(`${version}${commit ? ` · ${commit}` : ''}`) },
  build: { outDir: resolve(__dirname, 'out/web'), emptyOutDir: true },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@': resolve(__dirname, 'src/renderer/src')
    }
  },
  plugins: [react()]
})
