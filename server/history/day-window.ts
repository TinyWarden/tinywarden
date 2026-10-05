export const historyTimezone = "Europe/Bucharest";
const calendar = new Intl.DateTimeFormat("en", { timeZone: historyTimezone, year: "numeric", month: "2-digit",
  day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function parts(at: Date) {
  const values = Object.fromEntries(calendar.formatToParts(at).map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second) };
}
function wallTime(year: number, month: number, day: number, hour = 0, minute = 0, second = 0) {
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(hour, minute, second, 0);
  return date.getTime();
}
function midnight(wall: number) {
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const p = parts(new Date(guess));
    const offset = wallTime(p.year, p.month, p.day, p.hour, p.minute, p.second) - guess;
    guess = wall - offset;
  }
  return new Date(guess);
}
export function historyDayWindow(at: Date) {
  const p = parts(at), today = wallTime(p.year, p.month, p.day);
  return { start: midnight(today), next: midnight(today + 86400000), timezone: historyTimezone };
}
