/**
 * NSE/BSE market hours: 09:15-15:30 IST, Mon-Fri.
 *
 * Accepts an optional `now` for deterministic testing.
 */
export function isMarketOpen(now: Date = new Date()): boolean {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const m = ist.getHours() * 60 + ist.getMinutes();
  return m >= 555 && m <= 930;
}

/** Returns the next 04:00 IST after `from` as a local-clock Date for setTimeout scheduling. */
export function nextDailyResetMs(from: Date = new Date()): number {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(from.getTime() + istOffset + from.getTimezoneOffset() * 60 * 1000);
  const target = new Date(istNow);
  target.setHours(4, 0, 0, 0);
  if (target.getTime() <= istNow.getTime()) target.setDate(target.getDate() + 1);
  return target.getTime() - istNow.getTime();
}
