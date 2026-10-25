/** One simulated minute is the base time unit of the game. */
export interface GameClock {
  /** Campaign day, starting at 1. */
  day: number;
  /** Minutes since midnight, 0..1439, fractional while ticking. */
  minute: number;
}

export const MINUTES_PER_DAY = 1440;
export const WORKDAY_START = 7 * 60; // 07:00
export const WORKDAY_END = 18 * 60; // 18:00
export const CAMPAIGN_DAYS = 90;

export function formatClock(clock: GameClock): string {
  const m = Math.floor(clock.minute);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm.toString().padStart(2, '0')} ${suffix}`;
}

export function absoluteMinutes(clock: GameClock): number {
  return (clock.day - 1) * MINUTES_PER_DAY + clock.minute;
}

export function isWorkingHours(clock: GameClock): boolean {
  return clock.minute >= WORKDAY_START && clock.minute < WORKDAY_END;
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function weekdayName(day: number): string {
  return WEEKDAYS[(day - 1) % 7];
}
