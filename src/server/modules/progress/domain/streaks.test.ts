import { describe, expect, it } from "vitest";
import { addDays, dateKey, dateRange, daysBetween, startOfWeek, weekday } from "./calendar";
import { formatMinutes, intensity, streaks } from "./streaks";

describe("calendar", () => {
  it("reads the date in the student's time zone", () => {
    const at = new Date("2026-10-06T23:30:00Z");
    expect(dateKey(at, "UTC")).toBe("2026-10-06");
    expect(dateKey(at, "Europe/London")).toBe("2026-10-07");
    expect(dateKey(at, "America/Los_Angeles")).toBe("2026-10-06");
  });

  it("adds days across months, years and clock changes", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(daysBetween("2026-10-01", "2026-10-31")).toBe(30);
  });

  it("starts weeks on Monday", () => {
    expect(weekday("2026-10-05")).toBe(0);
    expect(weekday("2026-10-11")).toBe(6);
    expect(startOfWeek("2026-10-08")).toBe("2026-10-05");
    expect(dateRange("2026-10-05", "2026-10-07")).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
  });
});

describe("streaks", () => {
  const today = "2026-10-06";

  it("is zero with no study", () => {
    expect(streaks([], today)).toEqual({ current: 0, longest: 0, studiedToday: false });
  });

  it("counts consecutive days ending today", () => {
    expect(streaks(["2026-10-04", "2026-10-05", "2026-10-06"], today)).toEqual({
      current: 3,
      longest: 3,
      studiedToday: true,
    });
  });

  it("keeps a streak alive until today is over", () => {
    expect(streaks(["2026-10-04", "2026-10-05"], today)).toEqual({ current: 2, longest: 2, studiedToday: false });
  });

  it("breaks after a missed day but remembers the longest", () => {
    const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-10-03"];
    expect(streaks(days, today)).toEqual({ current: 0, longest: 4, studiedToday: false });
  });

  it("ignores duplicates, order and future days", () => {
    const days = ["2026-10-06", "2026-10-05", "2026-10-06", "2026-10-07"];
    expect(streaks(days, today)).toEqual({ current: 2, longest: 2, studiedToday: true });
  });
});

describe("intensity", () => {
  it("shades a day against the goal", () => {
    expect(intensity(0, 30)).toBe(0);
    expect(intensity(5 * 60, 30)).toBe(1);
    expect(intensity(20 * 60, 30)).toBe(2);
    expect(intensity(30 * 60, 30)).toBe(3);
    expect(intensity(60 * 60, 30)).toBe(4);
  });
});

describe("formatMinutes", () => {
  it("reads naturally", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(20)).toBe("under a minute");
    expect(formatMinutes(45 * 60)).toBe("45 min");
    expect(formatMinutes(60 * 60)).toBe("1 h");
    expect(formatMinutes(80 * 60)).toBe("1 h 20 min");
  });
});
