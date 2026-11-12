const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
] as const;

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
};

export type ScheduleIntent =
  | { action: "publish"; at: Date; adjusted: boolean }
  | { action: "revert"; at: Date; adjusted: boolean };

type Wall = { y: number; m: number; d: number; h: number; min: number };

function parts(date: Date, timeZone: string): Wall {
  const map = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return {
    y: Number(map.year),
    m: Number(map.month),
    d: Number(map.day),
    h: Number(map.hour),
    min: Number(map.minute)
  };
}

function offsetMs(timeZone: string, date: Date): number {
  const wall = parts(date, timeZone);
  const asUtc = Date.UTC(wall.y, wall.m - 1, wall.d, wall.h, wall.min);
  return asUtc - date.getTime();
}

/** Wall-clock time in a zone, as a UTC instant. A spring-forward gap moves ahead one hour. */
export function zonedTimeToUtc(
  wall: Wall,
  timeZone: string
): { date: Date; adjusted: boolean } {
  const wanted = Date.UTC(wall.y, wall.m - 1, wall.d, wall.h, wall.min);
  let guess = wanted;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = wanted - offsetMs(timeZone, new Date(guess));
    if (next === guess) break;
    guess = next;
  }
  const back = parts(new Date(guess), timeZone);
  if (back.h === wall.h && back.min === wall.min && back.d === wall.d) {
    return { date: new Date(guess), adjusted: false };
  }
  const shifted = zonedTimeToUtc({ ...wall, h: wall.h + 1 }, timeZone);
  return { date: shifted.date, adjusted: true };
}

function addDays(wall: Wall, days: number): Wall {
  const utc = new Date(Date.UTC(wall.y, wall.m - 1, wall.d + days));
  return { y: utc.getUTCFullYear(), m: utc.getUTCMonth() + 1, d: utc.getUTCDate(), h: 0, min: 0 };
}

function weekdayOf(wall: Wall): number {
  return new Date(Date.UTC(wall.y, wall.m - 1, wall.d)).getUTCDay();
}

function clockOf(text: string): { h: number; min: number } | null {
  const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (!match) return null;
  let h = Number(match[1]);
  const min = Number(match[2] ?? 0);
  const meridiem = match[3];
  if (meridiem === "pm" && h < 12) h += 12;
  if (meridiem === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return { h, min };
}

function resolveWhen(
  text: string,
  timeZone: string,
  now: Date
): { date: Date; adjusted: boolean } | null {
  const clock = clockOf(text) ?? { h: 0, min: 0 };
  const hasClock = clockOf(text) != null;
  const today = parts(now, timeZone);
  const weekday = text.match(
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/
  )?.[1];
  const month = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s*(\d{4}))?\b/
  );
  if (!weekday && !month && !hasClock) return null;
  let wall: Wall;
  if (month) {
    const name = month[1] ?? "";
    const m = MONTHS[name];
    if (!m) return null;
    const y = month[3] ? Number(month[3]) : today.y;
    wall = { y, m, d: Number(month[2]), h: clock.h, min: clock.min };
    let instant = zonedTimeToUtc(wall, timeZone);
    if (!month[3] && instant.date.getTime() <= now.getTime()) {
      wall = { ...wall, y: y + 1 };
      instant = zonedTimeToUtc(wall, timeZone);
    }
    return instant;
  }
  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday as (typeof WEEKDAYS)[number]);
    let cursor = { ...today, h: clock.h, min: clock.min };
    for (let step = 0; step < 8; step += 1) {
      if (weekdayOf(cursor) === target) {
        const instant = zonedTimeToUtc(cursor, timeZone);
        if (instant.date.getTime() > now.getTime()) return instant;
      }
      const next = addDays(cursor, 1);
      cursor = { ...next, h: clock.h, min: clock.min };
    }
    return null;
  }
  let cursor = { ...today, h: clock.h, min: clock.min };
  let instant = zonedTimeToUtc(cursor, timeZone);
  if (instant.date.getTime() <= now.getTime()) {
    const next = addDays(cursor, 1);
    cursor = { ...next, h: clock.h, min: clock.min };
    instant = zonedTimeToUtc(cursor, timeZone);
  }
  return instant;
}

export function parseSchedulePhrase(
  text: string,
  timeZone: string,
  now: Date
): ScheduleIntent | null {
  const lower = text.trim().toLowerCase();
  const revert = /\b(take .+ down|revert|unpublish)\b/.test(lower);
  const publish = /\b(publish|go live|schedule)\b/.test(lower);
  if (!revert && !publish) return null;
  const when = resolveWhen(lower, timeZone, now);
  if (!when) return null;
  if (revert && !publish) return { action: "revert", at: when.date, adjusted: when.adjusted };
  if (publish) return { action: "publish", at: when.date, adjusted: when.adjusted };
  return null;
}

export function describeInstant(date: Date, timeZone: string): string {
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
  return `${when} (${timeZone})`;
}

export function localInputToUtc(
  value: string,
  timeZone: string
): { date: Date; adjusted: boolean } | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  return zonedTimeToUtc(
    {
      y: Number(match[1]),
      m: Number(match[2]),
      d: Number(match[3]),
      h: Number(match[4]),
      min: Number(match[5])
    },
    timeZone
  );
}

export function confirmSchedule(intent: ScheduleIntent, timeZone: string): string {
  const when = describeInstant(intent.at, timeZone);
  if (intent.action === "revert") return `I'll take it down on ${when}.`;
  const note = intent.adjusted ? " That local time does not exist, so I moved it forward one hour." : "";
  return `I'll publish on ${when}.${note}`;
}
