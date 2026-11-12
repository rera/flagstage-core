"use client";

import { useState } from "react";

import { Button, fieldClass } from "@flagstage/ui";
import { formatScheduleWhen, localInputToUtc, zoneTitle } from "@flagstage/publish/when";

import { rescheduleAction, schedulePublishAction } from "./actions";

const WEEK = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function monthLabel(cursor: Date) {
  return cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function stamp(date: Date, h12: string, min: string, ampm: string) {
  let hour24 = Number(h12);
  if (ampm === "PM" && hour24 < 12) hour24 += 12;
  if (ampm === "AM" && hour24 === 12) hour24 = 0;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour24)}:${min}`;
}

export function SchedulePanel({
  siteId,
  accountId,
  snapshotId,
  timeZone,
  scheduleId,
  joined = false
}: {
  siteId: string;
  accountId: string;
  snapshotId?: string;
  timeZone: string;
  scheduleId?: string;
  joined?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => new Date());
  const [day, setDay] = useState<Date | null>(null);
  const [hour, setHour] = useState("9");
  const [minute, setMinute] = useState("00");
  const [meridiem, setMeridiem] = useState("AM");
  const [revertOn, setRevertOn] = useState(false);
  const [revertCursor, setRevertCursor] = useState(() => new Date());
  const [revertDay, setRevertDay] = useState<Date | null>(null);
  const [revertHour, setRevertHour] = useState("5");
  const [revertMinute, setRevertMinute] = useState("00");
  const [revertMeridiem, setRevertMeridiem] = useState("PM");

  const publishAt = day ? stamp(day, hour, minute, meridiem) : "";
  const revertAt =
    revertOn && revertDay ? stamp(revertDay, revertHour, revertMinute, revertMeridiem) : "";
  const preview = publishAt ? localInputToUtc(publishAt, timeZone) : null;
  const revertPreview = revertAt ? localInputToUtc(revertAt, timeZone) : null;

  return (
    <div className={joined ? "relative inline-flex" : "relative"}>
      <Button
        type="button"
        variant={joined ? "default" : "outline"}
        size={scheduleId ? "sm" : "default"}
        className={joined ? "px-3" : undefined}
        style={
          joined
            ? {
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                borderLeft: "1px solid rgb(255 255 255 / 0.35)"
              }
            : undefined
        }
        onClick={() => setOpen((value) => !value)}
      >
        {scheduleId ? "Reschedule" : "Schedule"}
      </Button>
      {open ? (
        <form
          action={scheduleId ? rescheduleAction : schedulePublishAction}
          className="absolute right-0 z-overlay mt-2 w-80 space-y-3 rounded-xl border border-border bg-popover p-3 shadow-sm"
        >
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="accountId" value={accountId} />
          {snapshotId ? <input type="hidden" name="snapshotId" value={snapshotId} /> : null}
          {scheduleId ? <input type="hidden" name="scheduleId" value={scheduleId} /> : null}
          <input type="hidden" name="publishAt" value={publishAt} />
          <input type="hidden" name="revertAt" value={revertAt} />
          <p className="text-xs font-medium text-muted-foreground">{zoneTitle(timeZone)}</p>
          <MonthGrid cursor={cursor} selected={day} onCursor={setCursor} onSelect={setDay} />
          {preview ? (
            <p className="text-sm font-medium">
              Goes live {formatScheduleWhen(preview.date, timeZone)}
              {revertPreview ? `. Reverts ${formatScheduleWhen(revertPreview.date, timeZone)}` : ""}
            </p>
          ) : null}
          <div className="grid grid-cols-3 gap-2">
            <label className="space-y-1 text-xs text-muted-foreground">
              Hour
              <select
                aria-label="Hour"
                className={fieldClass}
                value={hour}
                onChange={(event) => setHour(event.target.value)}
              >
                {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              Minute
              <select
                aria-label="Minute"
                className={fieldClass}
                value={minute}
                onChange={(event) => setMinute(event.target.value)}
              >
                {Array.from({ length: 60 }, (_, index) => pad(index)).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              AM or PM
              <select
                aria-label="AM or PM"
                className={fieldClass}
                value={meridiem}
                onChange={(event) => setMeridiem(event.target.value)}
              >
                <option>AM</option>
                <option>PM</option>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={revertOn}
              onChange={(event) => setRevertOn(event.target.checked)}
            />
            Revert later
          </label>
          {revertOn ? (
            <div className="space-y-2">
              <MonthGrid
                cursor={revertCursor}
                selected={revertDay}
                onCursor={setRevertCursor}
                onSelect={setRevertDay}
                label="Revert"
              />
              <div className="grid grid-cols-3 gap-2">
                <select
                  aria-label="Revert hour"
                  className={fieldClass}
                  value={revertHour}
                  onChange={(event) => setRevertHour(event.target.value)}
                >
                  {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <select
                  aria-label="Revert minute"
                  className={fieldClass}
                  value={revertMinute}
                  onChange={(event) => setRevertMinute(event.target.value)}
                >
                  {Array.from({ length: 60 }, (_, index) => pad(index)).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <select
                  aria-label="Revert AM or PM"
                  className={fieldClass}
                  value={revertMeridiem}
                  onChange={(event) => setRevertMeridiem(event.target.value)}
                >
                  <option>AM</option>
                  <option>PM</option>
                </select>
              </div>
            </div>
          ) : null}
          <Button type="submit" className="w-full" disabled={!day}>
            {scheduleId ? "Reschedule" : "Save schedule"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function MonthGrid({
  cursor,
  selected,
  onCursor,
  onSelect,
  label
}: {
  cursor: Date;
  selected: Date | null;
  onCursor: (date: Date) => void;
  onSelect: (date: Date) => void;
  label?: string;
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const cells: Array<Date | null> = Array.from({ length: first.getDay() }, () => null);
  const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  for (let dayNumber = 1; dayNumber <= count; dayNumber += 1) {
    cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), dayNumber));
  }
  return (
    <div className="space-y-2">
      {label ? <p className="text-xs font-medium text-muted-foreground">{label}</p> : null}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={label ? `${label} previous month` : "Previous month"}
          onClick={() => onCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
        >
          ‹
        </Button>
        <p className="text-sm font-medium">{monthLabel(cursor)}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={label ? `${label} next month` : "Next month"}
          onClick={() => onCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
        >
          ›
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {WEEK.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, index) =>
          date ? (
            <button
              key={date.toISOString()}
              type="button"
              aria-label={date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
              aria-pressed={selected?.toDateString() === date.toDateString()}
              className={`h-8 rounded-md text-sm ${
                selected?.toDateString() === date.toDateString()
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              }`}
              onClick={() => onSelect(date)}
            >
              {date.getDate()}
            </button>
          ) : (
            <span key={`empty-${index}`} />
          )
        )}
      </div>
    </div>
  );
}
