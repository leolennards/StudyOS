import { DEFAULT_FOCUS_MINUTES, FOCUS_PRESETS } from "@/server/modules/progress/domain/limits";

/**
 * The focus timer as plain data, kept in the browser's storage so it
 * survives navigating, reloading and closing the tab. Time is measured from
 * timestamps, never by counting ticks, so a backgrounded tab keeps time.
 */
export type Running = {
  phase: "focus" | "break";
  /** The id the finished session is saved under. */
  sessionId: string;
  subjectId: string | null;
  focusMinutes: number;
  plannedMs: number;
  /** When this focus block first started (ISO). */
  startedAt: string;
  /** When the clock last started running (ms since epoch), or null while paused. */
  runningSince: number | null;
  /** Time run before `runningSince`. */
  elapsedMs: number;
};

export type TimerState = { phase: "idle"; subjectId: string | null; focusMinutes: number } | Running;

export type PendingSession = {
  sessionId: string;
  subjectId: string | null;
  startedAt: string;
  endedAt: string;
  focusedSeconds: number;
};

export const IDLE: TimerState = { phase: "idle", subjectId: null, focusMinutes: DEFAULT_FOCUS_MINUTES };

export function breakMinutes(focusMinutes: number): number {
  return FOCUS_PRESETS.find((p) => p.focus === focusMinutes)?.rest ?? (focusMinutes > 30 ? 10 : 5);
}

export function elapsed(state: Running, now: number): number {
  return state.elapsedMs + (state.runningSince === null ? 0 : Math.max(0, now - state.runningSince));
}

export function remaining(state: Running, now: number): number {
  return Math.max(0, state.plannedMs - elapsed(state, now));
}

/** When a running block reached its planned length, or null if it hasn't. */
export function finishedAt(state: Running, now: number): number | null {
  if (state.runningSince === null || remaining(state, now) > 0) return null;
  return state.runningSince + (state.plannedMs - state.elapsedMs);
}

/** "24:59", or "1:04:59" past an hour. */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** The session to save for a focus block ended at `endedAt`. */
export function toSession(state: Running, endedAt: number): PendingSession {
  const focusedMs = Math.min(state.plannedMs, elapsed(state, endedAt));
  return {
    sessionId: state.sessionId,
    subjectId: state.subjectId,
    startedAt: state.startedAt,
    endedAt: new Date(endedAt).toISOString(),
    focusedSeconds: Math.floor(focusedMs / 1000),
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Reads stored state, falling back to idle if it is missing or from an older shape. */
export function parseState(raw: string | null): TimerState {
  if (!raw) return IDLE;
  try {
    const v: unknown = JSON.parse(raw);
    if (!isObject(v) || typeof v.focusMinutes !== "number") return IDLE;
    const subjectId = typeof v.subjectId === "string" ? v.subjectId : null;
    if (v.phase === "idle") return { phase: "idle", subjectId, focusMinutes: v.focusMinutes };
    if (
      (v.phase === "focus" || v.phase === "break") &&
      typeof v.sessionId === "string" &&
      typeof v.plannedMs === "number" &&
      typeof v.startedAt === "string" &&
      typeof v.elapsedMs === "number" &&
      (v.runningSince === null || typeof v.runningSince === "number")
    ) {
      return {
        phase: v.phase,
        sessionId: v.sessionId,
        subjectId,
        focusMinutes: v.focusMinutes,
        plannedMs: v.plannedMs,
        startedAt: v.startedAt,
        runningSince: v.runningSince,
        elapsedMs: v.elapsedMs,
      };
    }
  } catch {
    // Unreadable: start again.
  }
  return IDLE;
}
