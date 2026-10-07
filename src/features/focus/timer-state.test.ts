import { describe, expect, it } from "vitest";
import { elapsed, finishedAt, formatClock, parseState, type Running, remaining, toSession } from "./timer-state";

const base: Running = {
  phase: "focus",
  sessionId: "s",
  subjectId: null,
  focusMinutes: 25,
  plannedMs: 25 * 60_000,
  startedAt: "2026-10-06T10:00:00.000Z",
  runningSince: Date.parse("2026-10-06T10:00:00.000Z"),
  elapsedMs: 0,
};

describe("focus timer", () => {
  it("measures time from timestamps, leaving out pauses", () => {
    const paused = { ...base, runningSince: null, elapsedMs: 10 * 60_000 };
    expect(elapsed(paused, Date.now())).toBe(10 * 60_000);
    const resumed = { ...paused, runningSince: Date.parse("2026-10-06T11:00:00Z") };
    expect(remaining(resumed, Date.parse("2026-10-06T11:05:00Z"))).toBe(10 * 60_000);
  });

  it("knows when a block finished, even if the tab was closed", () => {
    const later = Date.parse("2026-10-06T12:00:00Z");
    expect(finishedAt(base, later)).toBe(Date.parse("2026-10-06T10:25:00Z"));
    expect(finishedAt(base, Date.parse("2026-10-06T10:10:00Z"))).toBeNull();
    const session = toSession(base, finishedAt(base, later)!);
    expect(session).toMatchObject({ endedAt: "2026-10-06T10:25:00.000Z", focusedSeconds: 1500 });
  });

  it("formats the clock", () => {
    expect(formatClock(25 * 60_000)).toBe("25:00");
    expect(formatClock(61_500)).toBe("1:02");
    expect(formatClock(65 * 60_000)).toBe("1:05:00");
  });

  it("reads stored state defensively", () => {
    expect(parseState(null).phase).toBe("idle");
    expect(parseState("not json").phase).toBe("idle");
    expect(parseState(JSON.stringify({ phase: "focus" })).phase).toBe("idle");
    expect(parseState(JSON.stringify(base))).toEqual(base);
  });
});
