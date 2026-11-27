import { describe, expect, it } from "vitest";

import {
  csvFilename,
  fieldLabel,
  notifyEmailList,
  notifyWebhook,
  submissionEntries,
  submissionFrom,
  submissionsCsv
} from "./forms-submissions";

describe("submission fields", () => {
  it("prefers a name, then an email", () => {
    expect(submissionFrom({ name: " Front desk ", email: "desk@example.com" })).toBe("Front desk");
    expect(submissionFrom({ full_name: "Ticket window", email: "tickets@example.com" })).toBe(
      "Ticket window"
    );
    expect(submissionFrom({ email: " press@example.com " })).toBe("press@example.com");
    expect(submissionFrom({ message: "Hello" })).toBe("Submission");
    expect(submissionFrom(null)).toBe("Submission");
  });

  it("lists submitted fields and skips the honeypot", () => {
    expect(
      submissionEntries({
        website: "spam",
        message: "Hello",
        email: "desk@example.com",
        parking: " north lot ",
        note: "   "
      })
    ).toEqual([
      { key: "email", label: "Email", value: "desk@example.com" },
      { key: "message", label: "Message", value: "Hello" },
      { key: "parking", label: "Parking", value: "north lot" }
    ]);
    expect(fieldLabel("fullName")).toBe("Name");
    expect(submissionEntries("nope")).toEqual([]);
  });

  it("checks notification addresses and https webhooks", () => {
    expect(notifyEmailList(" desk@example.com, press@example.com ")).toEqual([
      "desk@example.com",
      "press@example.com"
    ]);
    expect(notifyEmailList("")).toEqual([]);
    expect(notifyEmailList("not-an-email")).toBeNull();
    expect(notifyWebhook("")).toBe("");
    expect(notifyWebhook(" https://example.com/hooks/contact ")).toBe(
      "https://example.com/hooks/contact"
    );
    expect(notifyWebhook("http://example.com/hooks")).toBeNull();
  });

  it("exports the given rows, with commas quoted", () => {
    const csv = submissionsCsv(
      [
        {
          leadFormId: "tickets",
          createdAt: new Date("2026-11-24T18:42:00.000Z"),
          fields: {
            name: "Ticket window",
            email: "tickets@example.com",
            day: "Saturday",
            message: "Two passes, Saturday morning"
          }
        }
      ],
      [{ id: "tickets", name: "Tickets" }]
    );
    expect(csv.split("\n")[0]).toBe("From,Form,Received,name,email,day,message");
    expect(csv).toContain("Ticket window,Tickets,2026-11-24T18:42:00.000Z");
    expect(csv).toContain('"Two passes, Saturday morning"');
    expect(csv).not.toContain("Front desk");
    expect(csvFilename(null)).toBe("submissions.csv");
    expect(csvFilename("tickets")).toBe("tickets.csv");
    expect(csvFilename("a/b")).toBe("a-b.csv");
  });
});
