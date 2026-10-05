"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { isSafeHref } from "@/server/modules/notes/domain/content";

/** Adds, changes or removes the link on the selected text. */
export function LinkDialog({
  href,
  onSave,
  onRemove,
  onClose,
}: {
  /** The current link, "" for a new one, or null when closed. */
  href: string | null;
  onSave: (href: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={href !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {href !== null && <LinkForm initial={href} onSave={onSave} onRemove={onRemove} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function LinkForm({
  initial,
  onSave,
  onRemove,
  onClose,
}: {
  initial: string;
  onSave: (href: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | undefined>();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const raw = value.trim();
    const href = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    if (!raw || !isSafeHref(href)) {
      setError("Enter a web address, such as https://example.com, or an email link.");
      return;
    }
    onSave(href);
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{initial ? "Edit link" : "Add a link"}</DialogTitle>
        <DialogDescription>Links open in a new tab.</DialogDescription>
      </DialogHeader>
      <FormField id="link-href" label="Address" error={error}>
        <Input
          autoFocus
          type="url"
          inputMode="url"
          placeholder="https://"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </FormField>
      <DialogFooter>
        {initial && (
          <Button type="button" variant="ghost" className="text-destructive mr-auto" onClick={onRemove}>
            Remove link
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">Save link</Button>
      </DialogFooter>
    </form>
  );
}
