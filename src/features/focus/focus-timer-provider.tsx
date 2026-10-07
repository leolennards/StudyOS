"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { logFocusSession } from "@/server/actions/progress";
import { FOCUS_MIN_SECONDS } from "@/server/modules/progress/domain/limits";
import {
  breakMinutes,
  finishedAt,
  IDLE,
  parseState,
  type PendingSession,
  type Running,
  type TimerState,
  toSession,
} from "./timer-state";

const STATE_KEY = "studyos:focus-timer";
const PENDING_KEY = "studyos:focus-pending";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode): the timer still works until the tab closes.
  }
}

function readPending(): PendingSession[] {
  try {
    const v: unknown = JSON.parse(read(PENDING_KEY) ?? "[]");
    return Array.isArray(v) ? (v as PendingSession[]) : [];
  } catch {
    return [];
  }
}

/** A short two-note chime when a block ends. Silent if the browser blocks audio. */
function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    // No audio.
  }
}

type FocusTimer = {
  state: TimerState;
  /** The current time, updated every second while the clock runs. */
  now: number;
  /** False until the stored state has been read, so the server render and the first client render match. */
  ready: boolean;
  configure(patch: { subjectId?: string | null; focusMinutes?: number }): void;
  start(): void;
  pause(): void;
  resume(): void;
  /** Ends the focus block now and saves it (if it ran at least a minute), then starts the break. */
  finish(): void;
  /** Ends the block without saving it. */
  discard(): void;
  skipBreak(): void;
};

/**
 * The timer is shared through a store rather than a changing context value.
 * A context change above the page while it is still hydrating makes React
 * throw away the server-rendered page and render it again in the browser;
 * a store only re-renders the components that read it.
 */
type Store = { get(): FocusTimer; subscribe(listener: () => void): () => void; publish(value: FocusTimer): void };

const noop = () => {};
const INITIAL: FocusTimer = {
  state: IDLE,
  now: 0,
  ready: false,
  configure: noop,
  start: noop,
  pause: noop,
  resume: noop,
  finish: noop,
  discard: noop,
  skipBreak: noop,
};

function createStore(): Store {
  let value = INITIAL;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(next) {
      value = next;
      listeners.forEach((l) => l());
    },
  };
}

const FocusTimerContext = createContext<Store | null>(null);
const serverSnapshot = () => INITIAL;

export function useFocusTimer(): FocusTimer {
  const store = useContext(FocusTimerContext);
  if (!store) throw new Error("useFocusTimer must be used inside FocusTimerProvider");
  return useSyncExternalStore(store.subscribe, store.get, serverSnapshot);
}

/**
 * The focus timer (Architecture §28): one per browser, shared by every tab
 * and page through local storage, so it keeps running while the student
 * moves around the app. Finished blocks are saved as study sessions; a save
 * that fails is kept and retried, and its id makes a repeated save harmless.
 */
export function FocusTimerProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(createStore);
  return (
    <FocusTimerContext.Provider value={store}>
      <FocusTimerEngine store={store} />
      {children}
    </FocusTimerContext.Provider>
  );
}

/** Owns the timer's state and effects, and publishes them to the store. Renders nothing. */
function FocusTimerEngine({ store }: { store: Store }) {
  const router = useRouter();
  const [state, setStateRaw] = useState<TimerState>(IDLE);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const flushing = useRef(false);

  const setState = useCallback((next: TimerState) => {
    setStateRaw(next);
    write(STATE_KEY, JSON.stringify(next));
  }, []);

  /** Sends every unsaved session. Sessions the server refuses as invalid are dropped. */
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    let saved = 0;
    try {
      for (const session of readPending()) {
        let keep = false;
        try {
          const result = await logFocusSession(session);
          if (result.ok) saved++;
          else if (result.error.code === "INTERNAL") keep = true;
          else toast.error(result.error.message);
        } catch {
          keep = true; // Offline: try again later.
        }
        const rest = readPending().filter((p) => p.sessionId !== session.sessionId);
        write(PENDING_KEY, JSON.stringify(keep ? [...rest, session] : rest));
        if (keep) break;
      }
    } finally {
      flushing.current = false;
    }
    if (saved > 0) router.refresh();
  }, [router]);

  const save = useCallback(
    (session: PendingSession) => {
      if (session.focusedSeconds < FOCUS_MIN_SECONDS) return false;
      write(PENDING_KEY, JSON.stringify([...readPending().filter((p) => p.sessionId !== session.sessionId), session]));
      void flush();
      return true;
    },
    [flush],
  );

  const startBreak = useCallback(
    (from: Running, at: number) => {
      const minutes = breakMinutes(from.focusMinutes);
      setState({
        ...from,
        phase: "break",
        sessionId: crypto.randomUUID(),
        plannedMs: minutes * 60_000,
        startedAt: new Date(at).toISOString(),
        runningSince: at,
        elapsedMs: 0,
      });
    },
    [setState],
  );

  // Load the stored timer, and follow changes made in other tabs.
  useEffect(() => {
    // Reading storage must wait until after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStateRaw(parseState(read(STATE_KEY)));
    setReady(true);
    void flush();
    function onStorage(e: StorageEvent) {
      if (e.key === STATE_KEY) setStateRaw(parseState(e.newValue));
    }
    function onOnline() {
      void flush();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("online", onOnline);
    };
  }, [flush]);

  const running = state.phase !== "idle" && state.runningSince !== null;

  // Tick once a second while the clock runs.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [running]);

  // A block that reached its length ends by itself: focus is saved and the break begins; a break returns to idle.
  useEffect(() => {
    if (state.phase === "idle") return;
    const at = finishedAt(state, now);
    if (at === null) return;
    // Another tab may have handled it already; stored state wins.
    const stored = parseState(read(STATE_KEY));
    if (stored.phase === "idle" || stored.sessionId !== state.sessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStateRaw(stored);
      return;
    }
    const late = Date.now() - at > 60_000;
    if (state.phase === "focus") {
      save(toSession(state, at));
      if (!late) {
        chime();
        toast.success(`Focus block done. Take a ${breakMinutes(state.focusMinutes)}-minute break.`);
      }
      if (late) setState({ phase: "idle", subjectId: state.subjectId, focusMinutes: state.focusMinutes });
      else startBreak(state, at);
    } else {
      if (!late) {
        chime();
        toast("Break's over. Ready for another block?");
      }
      setState({ phase: "idle", subjectId: state.subjectId, focusMinutes: state.focusMinutes });
    }
  }, [state, now, save, setState, startBreak]);

  const value = useMemo<FocusTimer>(() => {
    const idleWith = (s: TimerState) => ({
      phase: "idle" as const,
      subjectId: s.subjectId,
      focusMinutes: s.focusMinutes,
    });
    return {
      state,
      now,
      ready,
      configure(patch) {
        if (state.phase !== "idle") return;
        setState({ ...state, ...patch });
      },
      start() {
        const at = Date.now();
        setNow(at);
        setState({
          phase: "focus",
          sessionId: crypto.randomUUID(),
          subjectId: state.subjectId,
          focusMinutes: state.focusMinutes,
          plannedMs: state.focusMinutes * 60_000,
          startedAt: new Date(at).toISOString(),
          runningSince: at,
          elapsedMs: 0,
        });
      },
      pause() {
        if (state.phase === "idle" || state.runningSince === null) return;
        const at = Date.now();
        setState({ ...state, runningSince: null, elapsedMs: state.elapsedMs + (at - state.runningSince) });
      },
      resume() {
        if (state.phase === "idle" || state.runningSince !== null) return;
        const at = Date.now();
        setNow(at);
        setState({ ...state, runningSince: at });
      },
      finish() {
        if (state.phase !== "focus") return;
        const at = Date.now();
        const saved = save(toSession(state, at));
        if (saved) {
          toast.success("Focus session saved.");
          startBreak(state, at);
        } else {
          toast("Sessions under a minute aren't saved.");
          setState(idleWith(state));
        }
      },
      discard() {
        setState(idleWith(state));
      },
      skipBreak() {
        if (state.phase !== "break") return;
        setState(idleWith(state));
      },
    };
  }, [state, now, ready, save, setState, startBreak]);

  useEffect(() => store.publish(value), [store, value]);
  return null;
}
