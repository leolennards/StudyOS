import Link from "next/link";
import { cn } from "@/lib/utils";
import { colourClasses } from "./subject-colour";

export type SubjectCardData = {
  id: string;
  name: string;
  code: string | null;
  term: string | null;
  colour: string;
  sectionCount: number;
  topicCount: number;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function SubjectCard({ subject }: { subject: SubjectCardData }) {
  const c = colourClasses(subject.colour);
  return (
    <Link
      href={`/subjects/${subject.id}`}
      className="group bg-card hover:border-ring/40 focus-visible:ring-ring/50 relative flex flex-col overflow-hidden rounded-xl border p-5 shadow-xs transition-[box-shadow,border-color] outline-none hover:shadow-md focus-visible:ring-[3px]"
    >
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-1", c.dot)} />
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn("grid size-10 shrink-0 place-items-center rounded-lg text-sm font-semibold", c.soft, c.text)}
        >
          {subject.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h2 className="group-hover:text-primary truncate font-semibold">{subject.name}</h2>
          <p className="text-muted-foreground truncate text-sm">
            {[subject.code, subject.term].filter(Boolean).join(" · ") || "No course code"}
          </p>
        </div>
      </div>
      <p className="text-muted-foreground mt-5 text-sm">
        {plural(subject.sectionCount, "section")} · {plural(subject.topicCount, "topic")}
      </p>
    </Link>
  );
}
