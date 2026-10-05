import Link from "next/link";
import { NotebookPen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { NoteActions } from "./note-actions";

export type NoteListItem = {
  id: string;
  subjectId: string;
  title: string;
  excerpt: string;
  wordCount: number;
  updatedAt: string;
  section: string | null;
  topics: { id: string; name: string }[];
};

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** A subject's notes, most recently edited first. */
export function NoteList({ notes }: { notes: NoteListItem[] }) {
  return (
    <ul aria-label="Notes" className="bg-card divide-y overflow-hidden rounded-xl border">
      {notes.map((note) => (
        <li key={note.id} className="flex items-start gap-3 p-3 sm:p-4">
          <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-lg" aria-hidden>
            <NotebookPen className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <Link
              href={`/subjects/${note.subjectId}/notes/${note.id}`}
              className="hover:text-primary focus-visible:ring-ring/50 block truncate rounded-sm font-medium outline-none focus-visible:ring-[3px]"
            >
              {note.title}
            </Link>
            {note.excerpt && <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">{note.excerpt}</p>}
            <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span>Edited {dateFormat.format(new Date(note.updatedAt))}</span>
              {note.section && (
                <>
                  <span aria-hidden>·</span>
                  <span>{note.section}</span>
                </>
              )}
              <span aria-hidden>·</span>
              <span>
                {note.wordCount} {note.wordCount === 1 ? "word" : "words"}
              </span>
            </p>
            {note.topics.length > 0 && (
              <ul aria-label="Topics" className="mt-2 flex flex-wrap gap-1">
                {note.topics.map((t) => (
                  <li key={t.id}>
                    <Badge variant="outline">{t.name}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <NoteActions inList note={{ id: note.id, subjectId: note.subjectId, title: note.title, trashed: false }} />
        </li>
      ))}
    </ul>
  );
}
