// Minimales Logging. Grundsatz: niemals Inhalte (Mails, Notizen, Prompts,
// Schlüssel) loggen – nur Ereignisnamen und technische Metadaten.

type Meta = Record<string, string | number | boolean | undefined>

function fmt(level: string, msg: string, meta?: Meta) {
  const m = meta ? ' ' + JSON.stringify(meta) : ''
  return `[tagwerk] ${level} ${msg}${m}`
}

export const log = {
  info: (msg: string, meta?: Meta) => console.log(fmt('info', msg, meta)),
  warn: (msg: string, meta?: Meta) => console.warn(fmt('warn', msg, meta)),
  error: (msg: string, meta?: Meta) => console.error(fmt('error', msg, meta))
}
