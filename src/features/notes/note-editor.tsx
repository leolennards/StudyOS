"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { AlertTriangle, Check, CloudOff, Loader2, Tags } from "lucide-react";
import "katex/dist/katex.min.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardDialog, type CardDialogState } from "@/features/flashcards/card-dialog";
import { TopicsDialog, type TopicsDialogState } from "@/features/knowledge/topics-dialog";
import type { TopicGroup } from "@/features/knowledge/topic-groups";
import { useAction } from "@/features/knowledge/use-action";
import { moveNote, setNoteTopics } from "@/server/actions/notes";
import { countWords } from "@/server/modules/notes/domain/content";
import { NOTE_TITLE_MAX } from "@/server/modules/notes/domain/limits";
import { noteExtensions, type MathTarget } from "./editor/extensions";
import { LinkDialog } from "./editor/link-dialog";
import { MathDialog } from "./editor/math-dialog";
import { slashCommand } from "./editor/slash-menu";
import { EditorToolbar } from "./editor/toolbar";
import { NoteActions } from "./note-actions";
import { useAutosave, type SaveState } from "./use-autosave";

export type EditorNote = {
  id: string;
  subjectId: string;
  sectionId: string | null;
  title: string;
  content: JSONContent;
  revision: number;
  wordCount: number;
  updatedAt: string;
  topicIds: string[];
  trashed: boolean;
  purgeAt: string | null;
};

export type SectionOption = { id: string; name: string; depth: number };

/**
 * A note: its title, where it is filed, and the block editor (ADR-010).
 * Changes save themselves; a note in the trash is shown read-only.
 */
export function NoteEditor({
  note,
  sections,
  topicGroups,
}: {
  note: EditorNote;
  sections: SectionOption[];
  topicGroups: TopicGroup[];
}) {
  const router = useRouter();
  const editable = !note.trashed;
  const [title, setTitle] = useState(note.title);
  const titleRef = useRef(note.title);
  const [words, setWords] = useState(note.wordCount);
  const [math, setMath] = useState<MathTarget | null>(null);
  const [linkHref, setLinkHref] = useState<string | null>(null);
  const [topicsState, setTopicsState] = useState<TopicsDialogState | null>(null);
  const [cardState, setCardState] = useState<CardDialogState | null>(null);
  const { run, pending: moving } = useAction();

  // Created once per editor: the callbacks only set state, which is stable.
  const extensions = useMemo(
    () =>
      noteExtensions({
        onEditMath: editable ? setMath : undefined,
        extra: [slashCommand((kind) => setMath({ kind, latex: "", pos: null }))],
      }),
    [editable],
  );

  const editor = useEditor({
    extensions,
    content: note.content,
    editable,
    immediatelyRender: false,
    // The styles live in globals.css; an injected <style> tag would be blocked by the CSP.
    injectCSS: false,
    editorProps: {
      attributes: {
        class: "note-content",
        "aria-label": "Note",
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    onUpdate: ({ editor: e }) => {
      autosave.saver.changed();
      setWords(countWords(e.getText()));
    },
  });

  const autosave = useAutosave({
    id: note.id,
    revision: note.revision,
    updatedAt: new Date(note.updatedAt),
    // A JSON round trip gives plain objects: ProseMirror's attribute objects
    // are not, and a Server Action would not send them as data.
    read: () =>
      editor ? { title: titleRef.current, content: JSON.parse(JSON.stringify(editor.state.doc.toJSON())) } : null,
  });

  const topicName = useMemo(
    () => new Map(topicGroups.flatMap((g) => g.topics).map((t) => [t.id, t.name] as const)),
    [topicGroups],
  );

  function changeTitle(value: string) {
    setTitle(value);
    titleRef.current = value;
    autosave.saver.changed();
  }

  function saveMath(latex: string) {
    if (!editor || !math) return;
    const chain = editor.chain().focus();
    if (math.pos === null) {
      if (math.kind === "inline") chain.insertInlineMath({ latex }).run();
      else {
        chain.insertBlockMath({ latex }).run();
        cursorAfterBlockMath(editor);
      }
    } else if (math.kind === "inline") chain.updateInlineMath({ latex, pos: math.pos }).run();
    else chain.updateBlockMath({ latex, pos: math.pos }).run();
    setMath(null);
  }

  function removeMath() {
    if (!editor || !math || math.pos === null) return;
    if (math.kind === "inline") editor.chain().focus().deleteInlineMath({ pos: math.pos }).run();
    else editor.chain().focus().deleteBlockMath({ pos: math.pos }).run();
    setMath(null);
  }

  function saveLink(href: string) {
    if (!editor) return;
    const { empty } = editor.state.selection;
    if (empty && !editor.isActive("link")) {
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkHref(null);
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkHref(null);
  }

  return (
    <div className="grid gap-4">
      {note.trashed && note.purgeAt && (
        <p
          role="status"
          className="bg-muted/50 text-muted-foreground flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          This note is in the trash and will be deleted for good on {longDate.format(new Date(note.purgeAt))}. Restore
          it to keep editing.
        </p>
      )}
      {autosave.state.kind === "conflict" && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center"
        >
          <AlertTriangle className="text-destructive size-4 shrink-0" aria-hidden />
          <p className="flex-1">
            {autosave.state.message} Your latest changes here are not saved, so copy anything you need first.
          </p>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      )}

      <div className="flex items-start gap-3">
        <TitleField
          value={title}
          onChange={changeTitle}
          readOnly={!editable}
          onEnter={() => editor?.commands.focus("start")}
        />
        <div className="flex shrink-0 items-center gap-1 pt-2">
          <SaveIndicator state={autosave.state} />
          <NoteActions
            note={{
              id: note.id,
              subjectId: note.subjectId,
              title: title.trim() || "Untitled note",
              trashed: note.trashed,
            }}
            beforeLeave={() => autosave.saver.flush()}
          />
        </div>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <span>Section</span>
          <select
            value={note.sectionId ?? ""}
            disabled={!editable || moving}
            onChange={(e) =>
              void run(() => moveNote({ id: note.id, sectionId: e.target.value || null }), { success: "Note moved" })
            }
            className="border-input bg-background text-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-8 max-w-56 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
          >
            <option value="">No section</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.depth > 1 ? "   " : ""}
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-1">
          {note.topicIds.length > 0 && (
            <ul aria-label="Topics" className="flex flex-wrap gap-1">
              {note.topicIds.map((id) => (
                <li key={id}>
                  <Badge variant="outline">{topicName.get(id)}</Badge>
                </li>
              ))}
            </ul>
          )}
          {editable && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() =>
                setTopicsState({ id: note.id, title: title.trim() || "this note", topicIds: note.topicIds })
              }
            >
              <Tags aria-hidden />
              {note.topicIds.length > 0 ? "Edit topics" : "Link topics"}
            </Button>
          )}
        </div>
        <span className="ml-auto tabular-nums" aria-live="off">
          {words} {words === 1 ? "word" : "words"}
        </span>
      </div>

      <div className="min-w-0">
        {editor && editable && (
          <EditorToolbar
            editor={editor}
            onLink={() => setLinkHref(String(editor.getAttributes("link").href ?? ""))}
            onMath={(kind) => setMath({ kind, latex: "", pos: null })}
            onFlashcard={() =>
              setCardState({
                mode: "create",
                draft: { front: selectedText(editor), topicIds: note.topicIds, sourceNoteId: note.id },
              })
            }
          />
        )}
        {editor ? (
          <EditorContent editor={editor} className="pt-4 pb-24" />
        ) : (
          <div aria-hidden className="note-content pt-4 opacity-50">
            Loading the editor…
          </div>
        )}
      </div>

      <MathDialog target={math} onSave={saveMath} onRemove={removeMath} onClose={() => setMath(null)} />
      <LinkDialog href={linkHref} onSave={saveLink} onRemove={removeLink} onClose={() => setLinkHref(null)} />
      <CardDialog
        subjectId={note.subjectId}
        groups={topicGroups}
        state={cardState}
        onClose={() => {
          setCardState(null);
          editor?.commands.focus();
        }}
      />
      <TopicsDialog
        subjectId={note.subjectId}
        groups={topicGroups}
        state={topicsState}
        description="Link the topics this note covers, so you can find it from each one."
        save={setNoteTopics}
        onClose={() => {
          setTopicsState(null);
          router.refresh();
        }}
      />
    </div>
  );
}

/** The selected text, with maths kept as LaTeX between dollar signs so the card shows it too. */
function selectedText(editor: Editor) {
  const { from, to } = editor.state.selection;
  if (from === to) return "";
  return editor.state.doc
    .textBetween(from, to, "\n", (node) => {
      if (node.type.name === "inlineMath") return `$${String(node.attrs.latex ?? "")}$`;
      if (node.type.name === "blockMath") return `$$${String(node.attrs.latex ?? "")}$$`;
      return "";
    })
    .trim();
}

const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** The title, as a heading-sized field that grows with its text. */
function TitleField({
  value,
  onChange,
  onEnter,
  readOnly,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  readOnly: boolean;
}) {
  return (
    <textarea
      aria-label="Title"
      placeholder="Untitled note"
      rows={1}
      maxLength={NOTE_TITLE_MAX}
      readOnly={readOnly}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onEnter();
        }
      }}
      className="placeholder:text-muted-foreground/60 field-sizing-content min-w-0 flex-1 resize-none bg-transparent text-3xl font-semibold tracking-tight outline-none"
    />
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const content = (() => {
    switch (state.kind) {
      case "saving":
        return (
          <>
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
          </>
        );
      case "unsaved":
        return <>Unsaved changes</>;
      case "saved":
        return (
          <>
            <Check className="size-3.5" aria-hidden /> Saved {time.format(state.at)}
          </>
        );
      case "error":
        return (
          <span className="text-destructive flex items-center gap-1.5" title={state.message}>
            <CloudOff className="size-3.5" aria-hidden />
            {state.retrying ? "Not saved, retrying" : state.message}
          </span>
        );
      case "conflict":
        return (
          <span className="text-destructive flex items-center gap-1.5">
            <AlertTriangle className="size-3.5" aria-hidden /> Not saved
          </span>
        );
    }
  })();
  return (
    <p
      role="status"
      aria-live="polite"
      data-save-state={state.kind}
      className="text-muted-foreground flex items-center gap-1.5 text-xs whitespace-nowrap"
    >
      {content}
    </p>
  );
}

/**
 * After an equation is inserted, the cursor goes to the line below it (adding
 * one if needed), so carrying on typing doesn't replace the equation.
 */
function cursorAfterBlockMath(editor: Editor) {
  const { selection, doc } = editor.state;
  const $pos = doc.resolve(selection.from);
  let after: number | null = null;
  if (selection instanceof NodeSelection && selection.node.type.name === "blockMath") after = selection.to;
  else if ($pos.nodeBefore?.type.name === "blockMath") after = $pos.pos;
  if (after === null) return;
  const next = doc.nodeAt(after);
  if (next?.isTextblock)
    editor
      .chain()
      .focus()
      .setTextSelection(after + 1)
      .run();
  else
    editor
      .chain()
      .focus()
      .insertContentAt(after, { type: "paragraph" })
      .setTextSelection(after + 1)
      .run();
}
