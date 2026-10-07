"use client";

import { useEffect } from "react";
import { Coffee, Pause, Play, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FOCUS_PRESETS } from "@/server/modules/progress/domain/limits";
import { useFocusTimer } from "./focus-timer-provider";
import { ProgressRing } from "./progress-ring";
import { elapsed, formatClock, remaining } from "./timer-state";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm";

/**
 * The focus timer's controls (Architecture §28): choose a subject and a
 * length, then work in a timed block followed by a short break. Space
 * pauses and resumes.
 */
export function FocusPanel({ subjects }: { subjects: { id: string; name: string }[] }) {
  const timer = useFocusTimer();
  const { state, now, ready } = timer;
  const idle = state.phase === "idle";
  const paused = !idle && state.runningSince === null;
  const subjectId = state.subjectId && subjects.some((s) => s.id === state.subjectId) ? state.subjectId : "";
  const subjectName = subjects.find((s) => s.id === subjectId)?.name;

  const left = idle ? state.focusMinutes * 60_000 : remaining(state, now);
  const progress = idle ? 0 : elapsed(state, now) / state.plannedMs;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (e.key !== " " || e.metaKey || e.ctrlKey || e.altKey) return;
      if (target?.closest("input, textarea, select, button, a, [contenteditable=true], [role=dialog]")) return;
      e.preventDefault();
      if (timer.state.phase === "idle") timer.start();
      else if (timer.state.runningSince === null) timer.resume();
      else timer.pause();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [timer]);

  const label =
    state.phase === "break" ? "Break" : state.phase === "focus" ? (paused ? "Paused" : "Focusing") : "Ready";

  return (
    <section
      aria-label="Focus timer"
      className="bg-card flex flex-col items-center rounded-xl border px-6 py-8 sm:py-10"
    >
      <ProgressRing
        value={progress}
        size={232}
        stroke={12}
        barClassName={cn(state.phase === "break" ? "text-success" : "text-primary")}
      >
        <div>
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
          <p
            className={cn("mt-1 text-5xl font-semibold tabular-nums", !ready && "opacity-0")}
            role="timer"
            aria-live="off"
            aria-label={`${formatClock(left)} left`}
          >
            {formatClock(left)}
          </p>
          {!idle && subjectName && (
            <p className="text-muted-foreground mt-1 max-w-40 truncate text-sm">{subjectName}</p>
          )}
        </div>
      </ProgressRing>

      {idle ? (
        <div className="mt-8 grid w-full max-w-sm gap-5">
          <div className="grid gap-2">
            <label htmlFor="focus-subject" className="text-sm font-medium">
              What are you studying?
            </label>
            <select
              id="focus-subject"
              className={selectClass}
              value={subjectId}
              disabled={!ready}
              onChange={(e) => timer.configure({ subjectId: e.target.value || null })}
            >
              <option value="">No particular subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Length</legend>
            <div className="grid grid-cols-4 gap-2">
              {FOCUS_PRESETS.map((p) => {
                const selected = state.focusMinutes === p.focus;
                return (
                  <button
                    key={p.focus}
                    type="button"
                    aria-pressed={selected}
                    disabled={!ready}
                    onClick={() => timer.configure({ focusMinutes: p.focus })}
                    className={cn(
                      "focus-visible:ring-ring/50 rounded-lg border px-2 py-2 text-sm outline-none focus-visible:ring-[3px]",
                      selected ? "border-primary bg-primary/10 text-primary font-medium" : "hover:bg-accent",
                    )}
                  >
                    {p.focus} min
                    <span className="text-muted-foreground block text-xs font-normal">{p.rest} min break</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <Button size="lg" onClick={timer.start} disabled={!ready}>
            <Play aria-hidden />
            Start focusing
          </Button>
        </div>
      ) : (
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {paused ? (
            <Button size="lg" onClick={timer.resume}>
              <Play aria-hidden />
              Resume
            </Button>
          ) : (
            <Button size="lg" variant="outline" onClick={timer.pause}>
              <Pause aria-hidden />
              Pause
            </Button>
          )}
          {state.phase === "focus" ? (
            <>
              <Button size="lg" variant="outline" onClick={timer.finish}>
                <Square aria-hidden />
                Finish and save
              </Button>
              <Button size="lg" variant="ghost" className="text-muted-foreground" onClick={timer.discard}>
                <X aria-hidden />
                Discard
              </Button>
            </>
          ) : (
            <Button size="lg" variant="ghost" onClick={timer.skipBreak}>
              <Coffee aria-hidden />
              Skip break
            </Button>
          )}
        </div>
      )}
      <p className="text-muted-foreground mt-6 hidden text-xs sm:block">
        Press <kbd className="bg-muted rounded border px-1.5 font-sans">Space</kbd> to{" "}
        {idle ? "start" : paused ? "resume" : "pause"}. The timer keeps running while you use the rest of StudyOS.
      </p>
    </section>
  );
}

/** A compact clock for the navigation while a block is running, or null when idle. */
export function useFocusBadge(): string | null {
  const { state, now, ready } = useFocusTimer();
  if (!ready || state.phase === "idle") return null;
  return formatClock(remaining(state, now));
}
