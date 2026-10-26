import { hashSeed } from './rng';

/**
 * Deterministic daily weather for the Las Vegas summer. Purely a function of seed and day so it
 * never touches saved state; the renderer and HUD derive everything from it.
 */
export type WeatherKind = 'clear' | 'heat-wave' | 'overcast' | 'monsoon';

export interface DayWeather {
  kind: WeatherKind;
  highF: number;
  label: string;
}

export function weatherForDay(seed: number, day: number): DayWeather {
  // The campaign always opens under a clear sky; weather varies from day 2.
  if (day <= 1) return { kind: 'clear', highF: 98, label: 'Sunny' };
  const h = hashSeed(`${seed}:${day}`);
  const r = (h % 1000) / 1000;
  const r2 = ((h >>> 10) % 1000) / 1000;
  if (r < 0.55) return { kind: 'clear', highF: 96 + Math.round(r2 * 8), label: 'Sunny' };
  if (r < 0.8) return { kind: 'heat-wave', highF: 106 + Math.round(r2 * 7), label: 'Heat advisory' };
  if (r < 0.92) return { kind: 'overcast', highF: 88 + Math.round(r2 * 8), label: 'Overcast' };
  return { kind: 'monsoon', highF: 84 + Math.round(r2 * 8), label: 'Monsoon storms' };
}

export const SUNRISE_MINUTE = 5.75 * 60; // 05:45
export const SUNSET_MINUTE = 19.5 * 60; // 19:30

/** Sun elevation (radians, negative below horizon) and azimuth for a minute of the day. */
export function sunAngles(minute: number): { elevation: number; azimuth: number } {
  const sunrise = SUNRISE_MINUTE;
  const sunset = SUNSET_MINUTE;
  const t = (minute - sunrise) / (sunset - sunrise); // 0 at sunrise, 1 at sunset
  const elevation = Math.sin(Math.PI * Math.min(1, Math.max(0, t))) * 1.22 - (t < 0 || t > 1 ? 0.35 : 0);
  // East (+x) at sunrise sweeping through the south (+z) to the west (-x).
  const azimuth = Math.PI * (1 - Math.min(1.1, Math.max(-0.1, t)));
  return { elevation, azimuth };
}
