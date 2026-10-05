import { describe, expect, it } from "vitest";
import { endOfDay, startOfDay } from "./day";

describe("startOfDay and endOfDay", () => {
  it("use midnight in UTC", () => {
    const at = new Date("2026-10-05T14:30:00Z");
    expect(startOfDay(at, "UTC").toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(endOfDay(at, "UTC").toISOString()).toBe("2026-10-06T00:00:00.000Z");
  });

  it("follow the student's time zone, not the server's", () => {
    // 23:30 in London (BST) on 5 October is still the 5th there.
    const at = new Date("2026-10-05T22:30:00Z");
    expect(startOfDay(at, "Europe/London").toISOString()).toBe("2026-10-04T23:00:00.000Z");
    // In Tokyo it is already 6 October.
    expect(startOfDay(at, "Asia/Tokyo").toISOString()).toBe("2026-10-05T15:00:00.000Z");
    expect(startOfDay(at, "America/New_York").toISOString()).toBe("2026-10-05T04:00:00.000Z");
  });

  it("handle the day the clocks change", () => {
    // The UK leaves summer time on 25 October 2026: that day is 25 hours long.
    const at = new Date("2026-10-25T12:00:00Z");
    const start = startOfDay(at, "Europe/London");
    const end = endOfDay(at, "Europe/London");
    expect(start.toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });

  it("handle zones with half-hour offsets", () => {
    const at = new Date("2026-10-05T20:00:00Z");
    expect(startOfDay(at, "Asia/Kolkata").toISOString()).toBe("2026-10-05T18:30:00.000Z");
  });
});
