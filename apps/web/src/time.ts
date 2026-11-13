function calendarDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function previousCalendarDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, date - 1)).toISOString().slice(0, 10);
}

function zoneAbbrev(timeZone: string, date: Date): string {
  if (timeZone === "UTC" || timeZone === "Etc/UTC") return "UTC";
  const raw =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? timeZone;
  if (raw === "GMT" || raw === "UTC") return "UTC";
  return raw.replace(/[SD](?=T$)/, "");
}

/** Month key in a time zone, YYYY-MM. */
export function monthKey(date: Date, timeZone = "UTC"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

/** Friendly clock in a time zone. Never an ISO timestamp, and never "Today" for a future instant. */
export function friendlyWhen(date: Date, timeZone = "UTC", now = new Date()): string {
  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
  const zone = zoneAbbrev(timeZone, date);
  const absolute = `${new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date)} ${zone}`;
  if (date.getTime() > now.getTime() + 60_000) return absolute;
  const today = calendarDay(now, timeZone);
  const that = calendarDay(date, timeZone);
  if (that === today) return `Today, ${clock} ${zone}`;
  if (that === previousCalendarDay(today)) return `Yesterday, ${clock} ${zone}`;
  return absolute;
}

export function versionLabel(
  kind: string,
  id: string,
  currentId: string | null
): "Published" | "Draft" {
  if (id === currentId || kind === "publish") return "Published";
  return "Draft";
}

/** Chat never shows a raw URL. A preview line becomes a short status. */
export function chatBody(body: string): string {
  if (/preview ready/i.test(body) || /https?:\/\/\S+/.test(body)) {
    if (/preview/i.test(body)) return "Preview updated";
    const stripped = body
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return stripped || "Preview updated";
  }
  return body;
}
