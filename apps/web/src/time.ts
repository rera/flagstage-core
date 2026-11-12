/** Friendly clock in a time zone. Never an ISO timestamp. */
export function friendlyWhen(date: Date, timeZone = "UTC", now = new Date()): string {
  const dayKey = (value: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(value);
  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
  const today = dayKey(now);
  const that = dayKey(date);
  const yesterday = dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  if (that === today) return `Today, ${clock}`;
  if (that === yesterday) return `Yesterday, ${clock}`;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function versionLabel(kind: string, id: string, currentId: string | null): "Published" | "Draft" {
  if (id === currentId || kind === "publish") return "Published";
  return "Draft";
}

/** Chat never shows a raw URL. A preview line becomes a short status. */
export function chatBody(body: string): string {
  if (/preview ready/i.test(body) || /https?:\/\/\S+/.test(body)) {
    if (/preview/i.test(body)) return "Preview updated";
    const stripped = body.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
    return stripped || "Preview updated";
  }
  return body;
}
