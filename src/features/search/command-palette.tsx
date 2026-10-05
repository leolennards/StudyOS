"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  FileText,
  GalleryVerticalEnd,
  Hash,
  Layers,
  Library,
  Loader2,
  NotebookPen,
  Search,
  Settings,
  Sunrise,
} from "lucide-react";
import { SubjectDot } from "@/features/knowledge/subject-dot";
import { cn } from "@/lib/utils";
import { search } from "@/server/actions/search";
import type { SearchResults } from "@/server/modules/search/service";

export type PaletteSubject = { id: string; name: string; colour: string };

type Snippet = { text: string; match: boolean }[];

const DEBOUNCE_MS = 150;
const SUBJECT_PATH = /^\/subjects\/([0-9a-f-]{36})(?:\/|$)/i;

/** Opens the palette from anywhere in the app with ⌘K or Ctrl+K. */
export function useCommandPaletteShortcut(setOpen: (fn: (open: boolean) => boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}

/**
 * Search everything, and jump anywhere (Architecture §1, §31): subjects,
 * topics, notes and the text of documents, from a palette available on every
 * page. Inside a subject it can be narrowed to that subject.
 */
export function CommandPalette({
  open,
  onOpenChange,
  subjects,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjects: PaletteSubject[];
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 fixed top-[12dvh] left-1/2 z-50 flex max-h-[76dvh] w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border shadow-2xl"
        >
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          {open && <Palette subjects={subjects} close={() => onOpenChange(false)} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Palette({ subjects, close }: { subjects: PaletteSubject[]; close: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const currentSubjectId = pathname.match(SUBJECT_PATH)?.[1];
  const currentSubject = subjects.find((s) => s.id === currentSubjectId);
  const [scoped, setScoped] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const subjectId = scoped && currentSubject ? currentSubject.id : undefined;
  const trimmed = query.trim();

  useEffect(() => {
    const id = ++request.current;
    if (!trimmed) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await search({ q: trimmed, subjectId });
        if (id !== request.current) return;
        if (result.ok) {
          setResults(result.data);
          setError(null);
        } else {
          setError(result.error.message);
        }
      } catch {
        if (id === request.current) setError("We couldn't reach StudyOS. Check your connection and try again.");
      } finally {
        if (id === request.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, subjectId]);

  function go(href: string) {
    close();
    router.push(href);
  }

  const shown = trimmed ? results : null;
  const total = shown
    ? shown.subjects.length + shown.topics.length + shown.notes.length + shown.cards.length + shown.documents.length
    : 0;
  const subjectName = new Map(subjects.map((s) => [s.id, s.name] as const));

  return (
    <Command shouldFilter={false} loop label="Search" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-4">
        {loading ? (
          <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" aria-hidden />
        ) : (
          <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
        )}
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search notes, documents, flashcards and topics…"
          className="placeholder:text-muted-foreground h-12 min-w-0 flex-1 bg-transparent text-base outline-none"
        />
        {currentSubject && (
          <button
            type="button"
            onClick={() => setScoped((s) => !s)}
            aria-pressed={scoped}
            className={cn(
              "focus-visible:ring-ring/50 flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs outline-none focus-visible:ring-[3px]",
              scoped ? "bg-accent text-accent-foreground border-transparent" : "text-muted-foreground",
            )}
          >
            <SubjectDot colour={currentSubject.colour} />
            <span className="max-w-32 truncate">{scoped ? `Only ${currentSubject.name}` : "Everywhere"}</span>
          </button>
        )}
      </div>

      <Command.List className="min-h-0 flex-1 overflow-y-auto p-2">
        {!trimmed && (
          <>
            <Group heading="Go to">
              <Item value="go-today" onSelect={() => go("/today")} icon={<Sunrise />} title="Today" />
              <Item value="go-review" onSelect={() => go("/review")} icon={<GalleryVerticalEnd />} title="Review" />
              <Item value="go-subjects" onSelect={() => go("/subjects")} icon={<Library />} title="Subjects" />
              <Item value="go-settings" onSelect={() => go("/settings")} icon={<Settings />} title="Settings" />
            </Group>
            {subjects.length > 0 && (
              <Group heading="Subjects">
                {subjects.map((s) => (
                  <Item
                    key={s.id}
                    value={`subject-${s.id}`}
                    onSelect={() => go(`/subjects/${s.id}`)}
                    icon={<SubjectDot colour={s.colour} />}
                    title={s.name}
                  />
                ))}
              </Group>
            )}
            <p className="text-muted-foreground px-2 pt-3 pb-1 text-xs">
              Tip: put words in &quot;quotes&quot; to find them together, and use -word to leave a word out.
            </p>
          </>
        )}

        {trimmed && error && <p className="text-destructive px-3 py-6 text-center text-sm">{error}</p>}
        {trimmed && !error && shown && total === 0 && !loading && (
          <p className="text-muted-foreground px-3 py-8 text-center text-sm">
            Nothing matches &ldquo;{shown.query}&rdquo;{subjectId ? ` in ${currentSubject?.name}` : ""}.
          </p>
        )}

        {shown && shown.subjects.length > 0 && (
          <Group heading="Subjects">
            {shown.subjects.map((s) => (
              <Item
                key={s.id}
                value={`subject-${s.id}`}
                onSelect={() => go(`/subjects/${s.id}`)}
                icon={<SubjectDot colour={s.colour} />}
                title={s.name}
                meta={s.archived ? "Archived" : (s.code ?? undefined)}
              />
            ))}
          </Group>
        )}
        {shown && shown.topics.length > 0 && (
          <Group heading="Topics">
            {shown.topics.map((t) => (
              <Item
                key={t.id}
                value={`topic-${t.id}`}
                onSelect={() => go(`/subjects/${t.subjectId}`)}
                icon={<Hash />}
                title={t.name}
                meta={t.subjectName}
              />
            ))}
          </Group>
        )}
        {shown && shown.notes.length > 0 && (
          <Group heading="Notes">
            {shown.notes.map((n) => (
              <Item
                key={n.id}
                value={`note-${n.id}`}
                onSelect={() => go(`/subjects/${n.subjectId}/notes/${n.id}`)}
                icon={<NotebookPen />}
                title={n.title}
                meta={subjectId ? undefined : subjectName.get(n.subjectId)}
                snippet={n.snippet}
              />
            ))}
          </Group>
        )}
        {shown && shown.cards.length > 0 && (
          <Group heading="Flashcards">
            {shown.cards.map((c) => (
              <Item
                key={c.id}
                value={`card-${c.id}`}
                onSelect={() => go(`/subjects/${c.subjectId}/flashcards?card=${c.id}`)}
                icon={<Layers />}
                title={c.title}
                meta={subjectId ? undefined : subjectName.get(c.subjectId)}
                snippet={c.snippet}
              />
            ))}
          </Group>
        )}
        {shown && shown.documents.length > 0 && (
          <Group heading="Documents">
            {shown.documents.flatMap((d) => {
              const href = `/subjects/${d.subjectId}/documents/${d.id}`;
              const pageLabel = d.format === "pptx" ? "Slide" : "Page";
              const where = subjectId ? undefined : subjectName.get(d.subjectId);
              if (d.pages.length === 0) {
                return [
                  <Item
                    key={d.id}
                    value={`document-${d.id}`}
                    onSelect={() => go(href)}
                    icon={<FileText />}
                    title={d.title}
                    meta={where}
                  />,
                ];
              }
              return d.pages.map((p) => (
                <Item
                  key={`${d.id}-${p.pageNumber}`}
                  value={`document-${d.id}-${p.pageNumber}`}
                  onSelect={() => go(`${href}?page=${p.pageNumber}`)}
                  icon={<FileText />}
                  title={d.title}
                  meta={[`${pageLabel} ${p.pageNumber}`, where].filter(Boolean).join(" · ")}
                  snippet={p.snippet}
                />
              ));
            })}
          </Group>
        )}
      </Command.List>

      <div className="text-muted-foreground hidden items-center gap-4 border-t px-4 py-2 text-xs sm:flex">
        <span>
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> to move
        </span>
        <span>
          <Kbd>↵</Kbd> to open
        </span>
        <span>
          <Kbd>esc</Kbd> to close
        </span>
      </div>
    </Command>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:text-muted-foreground mb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium"
    >
      {children}
    </Command.Group>
  );
}

function Item({
  value,
  onSelect,
  icon,
  title,
  meta,
  snippet,
}: {
  value: string;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  meta?: string;
  snippet?: Snippet;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 text-sm outline-none"
    >
      <span className="text-muted-foreground mt-0.5 grid size-4 shrink-0 place-items-center [&_svg]:size-4" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate font-medium">{title}</span>
          {meta && <span className="text-muted-foreground shrink-0 truncate text-xs">{meta}</span>}
        </span>
        {snippet && snippet.length > 0 && (
          <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-xs leading-5">
            {snippet.map((part, i) =>
              part.match ? (
                <mark key={i} className="text-foreground rounded-sm bg-amber-200/70 px-0.5 dark:bg-amber-400/30">
                  {part.text}
                </mark>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )}
          </span>
        )}
      </span>
    </Command.Item>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="bg-muted rounded border px-1.5 py-0.5 font-sans text-[0.7rem]">{children}</kbd>;
}
