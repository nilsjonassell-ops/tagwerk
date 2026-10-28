// Optionales Wetter über Open-Meteo (kein Konto, kein Schlüssel).
// Es wird nur der eingetragene Ortsname bzw. die daraus ermittelten Koordinaten übertragen.

import { net } from 'electron'
import type { WeatherResult } from '@shared/types'

let cache: { city: string; at: number; result: WeatherResult } | null = null

export async function getWeather(city: string): Promise<WeatherResult> {
  const q = city.trim()
  if (!q) return { ok: false, error: 'Kein Ort eingetragen.' }
  if (cache && cache.city === q && Date.now() - cache.at < 30 * 60_000) return cache.result
  if (!net.isOnline()) return { ok: false, error: 'Offline' }
  try {
    const geo = (await (
      await net.fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=de&name=${encodeURIComponent(q)}`)
    ).json()) as { results?: { latitude: number; longitude: number; name: string }[] }
    const place = geo.results?.[0]
    if (!place) return { ok: false, error: `Ort „${q}“ nicht gefunden.` }
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`
    const w = (await (await net.fetch(url)).json()) as {
      current?: { temperature_2m: number; weather_code: number }
      daily?: { temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[] }
    }
    const result: WeatherResult = {
      ok: true,
      city: place.name,
      temperature: w.current?.temperature_2m,
      code: w.current?.weather_code,
      max: w.daily?.temperature_2m_max?.[0],
      min: w.daily?.temperature_2m_min?.[0],
      precipitation: w.daily?.precipitation_probability_max?.[0]
    }
    cache = { city: q, at: Date.now(), result }
    return result
  } catch {
    return { ok: false, error: 'Wetterdienst nicht erreichbar.' }
  }
}
