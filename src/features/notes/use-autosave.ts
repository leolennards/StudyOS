"use client";

import { useEffect, useState } from "react";
import { saveNote } from "@/server/actions/notes";
import type { SaveNoteInput } from "@/server/modules/notes/schemas";

export type SaveState =
  | { kind: "saved"; at: Date }
  | { kind: "unsaved" }
  | { kind: "saving" }
  /** Saving failed; when `retrying`, it is tried again automatically. Any change also tries again. */
  | { kind: "error"; message: string; retrying: boolean }
  /** Someone saved a newer version elsewhere. Saving stops until the page is reloaded. */
  | { kind: "conflict"; message: string };

type SaveResult = Awaited<ReturnType<typeof saveNote>>;
type Content = Omit<SaveNoteInput, "id" | "revision">;

const DEBOUNCE_MS = 800;
const RETRY_MS = 5000;

/**
 * Saves one note: shortly after the last change, one save at a time, always
 * against the revision the previous save returned, so a newer version saved
 * elsewhere is never overwritten.
 */
class Autosaver {
  private revision: number;
  private dirty = false;
  private saving = false;
  private blocked = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly id: string,
    revision: number,
    private readonly setState: (s: SaveState | ((prev: SaveState) => SaveState)) => void,
  ) {
    this.revision = revision;
  }

  /** Returns what to save at the moment a save starts. */
  private read: () => Content | null = () => null;

  setReader(read: () => Content | null) {
    this.read = read;
  }

  get pending() {
    return this.dirty || this.saving;
  }

  changed() {
    if (this.blocked) return;
    this.dirty = true;
    this.setState((s) => (s.kind === "error" && !s.retrying ? s : { kind: "unsaved" }));
    this.schedule(DEBOUNCE_MS);
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.saving || !this.dirty || this.blocked) return;
    const input = this.read();
    if (!input) return;
    this.saving = true;
    this.dirty = false;
    this.setState({ kind: "saving" });

    let result: SaveResult | null;
    try {
      result = await saveNote({ id: this.id, revision: this.revision, ...input });
    } catch {
      result = null;
    }
    this.saving = false;

    if (result?.ok) {
      this.revision = result.data.revision;
      if (this.dirty) return this.flush();
      this.setState({ kind: "saved", at: new Date(result.data.updatedAt) });
      return;
    }
    this.dirty = true;
    if (result?.error.code === "CONFLICT") {
      this.blocked = true;
      this.setState({ kind: "conflict", message: result.error.message });
    } else if (result?.error.code === "VALIDATION") {
      // The same content would fail the same way; wait for the next change.
      this.setState({ kind: "error", message: result.error.message, retrying: false });
    } else {
      this.setState({ kind: "error", message: result?.error.message ?? "You seem to be offline.", retrying: true });
      this.schedule(RETRY_MS);
    }
  }

  stop() {
    clearTimeout(this.timer);
  }

  private schedule(ms: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), ms);
  }
}

/**
 * Autosave for the note editor. Unsaved work is sent when the student leaves
 * the page within the app, ⌘S/Ctrl+S saves straight away, and the browser
 * asks before closing a tab with changes not yet saved.
 */
export function useAutosave({
  id,
  revision,
  updatedAt,
  read,
}: {
  id: string;
  revision: number;
  updatedAt: Date;
  read: () => Content | null;
}) {
  const [state, setState] = useState<SaveState>({ kind: "saved", at: updatedAt });
  const [saver] = useState(() => new Autosaver(id, revision, setState));

  useEffect(() => {
    saver.setReader(read);
  });

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saver.pending) e.preventDefault();
    };
    const saveShortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saver.flush();
      }
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("keydown", saveShortcut);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("keydown", saveShortcut);
      saver.stop();
      // Leaving the page within the app: send what hasn't been saved yet.
      void saver.flush();
    };
  }, [saver]);

  return { state, saver };
}
