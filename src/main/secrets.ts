// Speichert den Anthropic-API-Schlüssel verschlüsselt über das Betriebssystem
// (Windows DPAPI, macOS Schlüsselbund) via Electron safeStorage.
// Der Schlüssel verlässt den Hauptprozess nie in Richtung Oberfläche.

import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Nur für automatisierte Tests in Entwicklungs-Builds ohne Schlüsselbund (z. B. Linux-CI):
// Schlüssel bleibt im Arbeitsspeicher und wird nie auf die Platte geschrieben.
const memoryOnly = !app.isPackaged && process.env.TAGWERK_TEST_MEMORY_KEYSTORE === '1'
let memoryKey: string | null = null

const file = () => {
  const d = join(app.getPath('userData'), 'secure')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return join(d, 'anthropic.key')
}

async function osEncryptionAvailable(): Promise<boolean> {
  const ss = safeStorage as typeof safeStorage & { isAsyncEncryptionAvailable?: () => Promise<boolean> }
  if (typeof ss.isAsyncEncryptionAvailable === 'function') return ss.isAsyncEncryptionAvailable()
  return safeStorage.isEncryptionAvailable()
}

export const secrets = {
  encryptionAvailable: async () => memoryOnly || (await osEncryptionAvailable()),
  hasKey: () => (memoryOnly ? !!memoryKey : existsSync(file())),
  async setKey(key: string) {
    if (memoryOnly) {
      memoryKey = key
      return
    }
    if (!(await osEncryptionAvailable())) {
      throw new Error('Die sichere Ablage des Betriebssystems ist nicht verfügbar.')
    }
    writeFileSync(file(), safeStorage.encryptString(key), { mode: 0o600 })
  },
  getKey(): string | null {
    if (memoryOnly) return memoryKey
    try {
      if (!existsSync(file())) return null
      return safeStorage.decryptString(readFileSync(file()))
    } catch {
      return null
    }
  },
  clear() {
    memoryKey = null
    rmSync(file(), { force: true })
  }
}
