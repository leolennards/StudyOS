"use client";

import { useMemo, useState } from "react";
import katex from "katex";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { MathTarget } from "./extensions";

/**
 * Writes or edits a LaTeX formula, with a live preview rendered by KaTeX.
 * `pos` is set when editing a formula already in the note.
 */
export function MathDialog({
  target,
  onSave,
  onRemove,
  onClose,
}: {
  target: MathTarget | null;
  onSave: (latex: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {target && (
          <MathForm
            key={`${target.kind}-${target.pos}`}
            target={target}
            onSave={onSave}
            onRemove={onRemove}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MathForm({
  target,
  onSave,
  onRemove,
  onClose,
}: {
  target: MathTarget;
  onSave: (latex: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [latex, setLatex] = useState(target.latex);
  const editing = target.pos !== null;
  const preview = useMemo(() => {
    try {
      // KaTeX builds this markup from the formula; `trust` is off, so it contains no links or scripts.
      const html = katex.renderToString(latex || "\\text{Your formula appears here}", {
        displayMode: target.kind === "block",
        throwOnError: true,
      });
      return { html, error: null };
    } catch (e) {
      const message = e instanceof Error ? e.message.replace(/^KaTeX parse error: /, "") : "";
      return { html: "", error: message || "That formula can't be read." };
    }
  }, [latex, target.kind]);
  const error = preview.error;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!latex.trim()) return;
    onSave(latex.trim());
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {editing ? "Edit formula" : target.kind === "block" ? "Add an equation" : "Add inline maths"}
        </DialogTitle>
        <DialogDescription>
          Write LaTeX, for example <code className="font-mono">{"\\frac{a}{b}"}</code> or{" "}
          <code className="font-mono">{"\\int_0^1 x^2\\,dx"}</code>.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="math-latex">LaTeX</Label>
        <Textarea
          id="math-latex"
          autoFocus
          rows={3}
          spellCheck={false}
          className="font-mono"
          value={latex}
          onChange={(e) => setLatex(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby="math-preview-status"
        />
      </div>
      <div className="bg-muted/40 grid min-h-16 place-items-center overflow-x-auto rounded-lg border px-3 py-4">
        {!error && <div aria-label="Preview" dangerouslySetInnerHTML={{ __html: preview.html }} />}
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
      <p id="math-preview-status" className="sr-only" aria-live="polite">
        {error ? `The formula has an error: ${error}` : ""}
      </p>
      <DialogFooter>
        {editing && (
          <Button type="button" variant="ghost" className="text-destructive mr-auto" onClick={onRemove}>
            Remove formula
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={!latex.trim()}>
          {editing ? "Update" : "Insert"}
        </Button>
      </DialogFooter>
    </form>
  );
}
