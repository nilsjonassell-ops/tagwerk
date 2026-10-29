// Hintergrundklänge und Signaltöne für den Fokus-Modus – komplett per Web Audio
// erzeugt, keine Audiodateien nötig.

import type { FocusSound } from '@shared/types'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let source: AudioBufferSourceNode | null = null
let lfo: OscillatorNode | null = null
let current: FocusSound = 'none'

function audio() {
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function noiseBuffer(kind: Exclude<FocusSound, 'none'>): AudioBuffer {
  const c = audio()
  const len = c.sampleRate * 4
  const buf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let last = 0
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      if (kind === 'white') d[i] = w * 0.25
      else if (kind === 'brown' || kind === 'cafe') {
        last = (last + 0.02 * w) / 1.02
        d[i] = last * 3.2
      } else {
        // Rosa Rauschen (Paul Kellet) – Grundlage für Regen
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.969 * b2 + w * 0.153852
        b3 = 0.8665 * b3 + w * 0.3104856
        b4 = 0.55 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.016898
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.09
        b6 = w * 0.115926
        // vereinzelte Tropfen
        if (Math.random() < 0.0006) d[i] += (Math.random() * 2 - 1) * 0.35
      }
    }
  }
  return buf
}

/** Startet oder wechselt den Hintergrundklang. */
export function playAmbient(kind: FocusSound, volume: number) {
  if (kind === current && source) return setAmbientVolume(volume)
  stopAmbient(true)
  current = kind
  if (kind === 'none') return
  const c = audio()
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(kind)
  src.loop = true
  let node: AudioNode = src
  if (kind === 'rain') {
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 350
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 7000
    node.connect(hp)
    hp.connect(lp)
    node = lp
  } else if (kind === 'cafe') {
    const bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 520
    bp.Q.value = 0.6
    node.connect(bp)
    node = bp
  } else if (kind === 'brown') {
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 900
    node.connect(lp)
    node = lp
  }
  // sanftes Atmen der Lautstärke, damit es natürlicher klingt
  const breath = c.createGain()
  breath.gain.value = 1
  lfo = c.createOscillator()
  lfo.frequency.value = kind === 'rain' ? 0.08 : 0.05
  const depth = c.createGain()
  depth.gain.value = 0.12
  lfo.connect(depth)
  depth.connect(breath.gain)
  lfo.start()
  node.connect(breath)
  breath.connect(master!)
  src.start()
  source = src
  setAmbientVolume(volume)
}

export function setAmbientVolume(volume: number) {
  if (!ctx || !master) return
  const v = current === 'none' ? 0 : Math.max(0, Math.min(1, volume))
  master.gain.cancelScheduledValues(ctx.currentTime)
  master.gain.setTargetAtTime(v * 0.9, ctx.currentTime, 0.4)
}

export function stopAmbient(immediate = false) {
  if (!ctx || !master) {
    current = 'none'
    return
  }
  const s = source
  const l = lfo
  source = null
  lfo = null
  current = 'none'
  master.gain.cancelScheduledValues(ctx.currentTime)
  master.gain.setTargetAtTime(0, ctx.currentTime, immediate ? 0.05 : 0.5)
  setTimeout(() => {
    try {
      s?.stop()
      l?.stop()
    } catch {
      /* schon gestoppt */
    }
  }, immediate ? 120 : 1500)
}

/** Kurzer, freundlicher Gong – aufsteigend zum Fokusende, absteigend zum Pausenende. */
export function chime(kind: 'focus-end' | 'break-end' | 'start') {
  try {
    const c = audio()
    const notes = kind === 'focus-end' ? [659.25, 987.77, 1318.5] : kind === 'break-end' ? [1046.5, 783.99] : [783.99]
    const out = c.createGain()
    out.gain.value = 0.18
    out.connect(c.destination)
    notes.forEach((f, i) => {
      const t = c.currentTime + i * 0.18
      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      const g = c.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(1, t + 0.015)
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.4)
      o.connect(g)
      g.connect(out)
      o.start(t)
      o.stop(t + 1.5)
    })
  } catch {
    /* Audio nicht verfügbar */
  }
}
