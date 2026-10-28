// Verschlüsselte Ablage für Zugangsdaten (Anthropic-Schlüssel, Google-Tokens)
// über das Betriebssystem (Windows DPAPI, macOS Schlüsselbund) via Electron safeStorage.
// Inhalte verlassen den Hauptprozess nie in Richtung Oberfläche.

import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Nur für automatisierte Tests in Entwicklungs-Builds ohne Schlüsselbund (z. B. Linux-CI):
// Werte bleiben im Arbeitsspeicher und werden nie auf die Platte geschrieben.
const memoryOnly = !app.isPackaged && process.env.TAGWERK_TEST_MEMORY_KEYSTORE === '1'
const memory = new Map<string, string>()

const file = (name: string) => {
  const d = join(app.getPath('userData'), 'secure')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return join(d, `${name}.bin`)
}

async function osEncryptionAvailable(): Promise<boolean> {
  const ss = safeStorage as typeof safeStorage & { isAsyncEncryptionAvailable?: () => Promise<boolean> }
  if (typeof ss.isAsyncEncryptionAvailable === 'function') return ss.isAsyncEncryptionAvailable()
  return safeStorage.isEncryptionAvailable()
}

function has(name: string): boolean {
  return memoryOnly ? memory.has(name) : existsSync(file(name))
}

async function put(name: string, value: string) {
  if (memoryOnly) {
    memory.set(name, value)
    return
  }
  if (!(await osEncryptionAvailable())) throw new Error('Die sichere Ablage des Betriebssystems ist nicht verfügbar.')
  writeFileSync(file(name), safeStorage.encryptString(value), { mode: 0o600 })
}

function get(name: string): string | null {
  if (memoryOnly) return memory.get(name) ?? null
  try {
    if (!existsSync(file(name))) return null
    return safeStorage.decryptString(readFileSync(file(name)))
  } catch {
    return null
  }
}

function remove(name: string) {
  memory.delete(name)
  rmSync(file(name), { force: true })
}

// Ältere Version speicherte den Schlüssel als anthropic.key
function migrateLegacy() {
  if (memoryOnly) return
  const legacy = join(app.getPath('userData'), 'secure', 'anthropic.key')
  if (existsSync(legacy) && !existsSync(file('anthropic'))) {
    try {
      writeFileSync(file('anthropic'), readFileSync(legacy), { mode: 0o600 })
      rmSync(legacy, { force: true })
    } catch {
      /* ignorieren */
    }
  }
}

export const secrets = {
  encryptionAvailable: async () => memoryOnly || (await osEncryptionAvailable()),
  hasKey: () => (migrateLegacy(), has('anthropic')),
  setKey: (key: string) => put('anthropic', key),
  getKey: () => (migrateLegacy(), get('anthropic')),
  clear: () => remove('anthropic'),

  getJson<T>(name: string): T | null {
    const raw = get(name)
    if (!raw) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  },
  setJson: (name: string, value: unknown) => put(name, JSON.stringify(value)),
  remove,
  wipeAll() {
    memory.clear()
    rmSync(join(app.getPath('userData'), 'secure'), { recursive: true, force: true })
  }
}
