"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  FolderPlus,
  Hash,
  ListTree,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { deleteSection, deleteTopic, getSectionDeleteImpact, moveSection, moveTopic } from "@/server/actions/knowledge";
import { MAX_SECTION_DEPTH } from "@/server/modules/knowledge/domain/constants";
import { ConfirmDialog, type ConfirmState } from "./confirm-dialog";
import { SectionDialog, type SectionDialogState } from "./section-dialog";
import { TopicDialog, type TopicDialogState } from "./topic-dialog";
import { flattenSections, type SectionView, type TopicView } from "./types";
import { useAction } from "./use-action";

/**
 * Edits a subject's structure: sections (up to two levels) and the topics in
 * them. All changes go through Server Actions; the page re-renders from the
 * database afterwards, so what you see is always what is stored.
 */
export function StructureEditor({
  subjectId,
  sections,
  unsectioned,
}: {
  subjectId: string;
  sections: SectionView[];
  unsectioned: TopicView[];
}) {
  const [sectionDialog, setSectionDialog] = useState<SectionDialogState | null>(null);
  const [topicDialog, setTopicDialog] = useState<TopicDialogState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const { run } = useAction();

  const defaultLabel = sections[0]?.label ?? "Module";
  const sectionOptions = flattenSections(sections);
  const isEmpty = sections.length === 0 && unsectioned.length === 0;

  const handlers: Handlers = {
    addSubsection: (s) =>
      setSectionDialog({
        mode: "create",
        subjectId,
        parentId: s.id,
        parentName: `${s.label} ${s.title}`,
        defaultLabel: s.children[0]?.label ?? (s.label === "Module" ? "Chapter" : "Part"),
      }),
    editSection: (s) => setSectionDialog({ mode: "edit", id: s.id, label: s.label, title: s.title }),
    moveSection: (s, direction) => run(() => moveSection({ id: s.id, direction })),
    deleteSection: async (s) => {
      const impact = await run(() => getSectionDeleteImpact({ id: s.id }));
      if (!impact) return;
      const parts = [
        impact.childSections > 0 && `its ${impact.childSections} sub-section${impact.childSections === 1 ? "" : "s"}`,
      ].filter(Boolean);
      setConfirm({
        title: `Delete "${s.title}"?`,
        description: [
          `This deletes the section${parts.length ? ` and ${parts.join(", ")}` : ""}.`,
          impact.topics > 0
            ? `Its ${impact.topics} topic${impact.topics === 1 ? "" : "s"} will be kept and moved to "Topics without a section".`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
        confirmLabel: "Delete section",
        onConfirm: () => run(() => deleteSection({ id: s.id }), { success: "Section deleted" }),
      });
    },
    addTopic: (sectionId) => setTopicDialog({ mode: "create", sectionId }),
    editTopic: (t) => setTopicDialog({ mode: "edit", ...t }),
    moveTopic: (t, direction) => run(() => moveTopic({ id: t.id, direction })),
    deleteTopic: (t) =>
      setConfirm({
        title: `Delete "${t.name}"?`,
        description: "This permanently deletes the topic.",
        confirmLabel: "Delete topic",
        onConfirm: () => run(() => deleteTopic({ id: t.id }), { success: "Topic deleted" }),
      }),
  };

  return (
    <section aria-labelledby="structure-heading" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="structure-heading" className="text-lg font-semibold">
            Structure
          </h2>
          <p className="text-muted-foreground text-sm">
            Sections organise the course; topics are what you need to learn.
          </p>
        </div>
        {!isEmpty && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setTopicDialog({ mode: "create", sectionId: null })}>
              <Plus aria-hidden />
              Topic
            </Button>
            <Button
              size="sm"
              onClick={() => setSectionDialog({ mode: "create", subjectId, parentId: null, defaultLabel })}
            >
              <FolderPlus aria-hidden />
              Section
            </Button>
          </div>
        )}
      </div>

      {isEmpty ? (
        <EmptyState
          icon={<ListTree />}
          title="Map out this subject"
          description="Add the course's modules, chapters or weeks as sections, then the topics inside each. You can also add topics without a section."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setSectionDialog({ mode: "create", subjectId, parentId: null, defaultLabel })}>
                <FolderPlus aria-hidden />
                Add a section
              </Button>
              <Button variant="outline" onClick={() => setTopicDialog({ mode: "create", sectionId: null })}>
                <Plus aria-hidden />
                Add a topic
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-3">
          {sections.map((s, i) => (
            <SectionItem
              key={s.id}
              section={s}
              depth={1}
              isFirst={i === 0}
              isLast={i === sections.length - 1}
              handlers={handlers}
            />
          ))}
          {unsectioned.length > 0 && (
            <div className="bg-card rounded-xl border">
              <div className="flex items-center gap-2 px-4 py-3">
                <h3 className="text-muted-foreground text-sm font-medium">Topics without a section</h3>
              </div>
              <TopicList topics={unsectioned} handlers={handlers} />
            </div>
          )}
        </div>
      )}

      <SectionDialog state={sectionDialog} onClose={() => setSectionDialog(null)} />
      <TopicDialog
        subjectId={subjectId}
        sections={sectionOptions}
        state={topicDialog}
        onClose={() => setTopicDialog(null)}
      />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </section>
  );
}

type Handlers = {
  addSubsection: (s: SectionView) => void;
  editSection: (s: SectionView) => void;
  moveSection: (s: SectionView, direction: "up" | "down") => void;
  deleteSection: (s: SectionView) => void;
  addTopic: (sectionId: string | null) => void;
  editTopic: (t: TopicView) => void;
  moveTopic: (t: TopicView, direction: "up" | "down") => void;
  deleteTopic: (t: TopicView) => void;
};

function countTopics(s: SectionView): number {
  return s.topics.length + s.children.reduce((n, c) => n + countTopics(c), 0);
}

function SectionItem({
  section,
  depth,
  isFirst,
  isLast,
  handlers,
}: {
  section: SectionView;
  depth: number;
  isFirst: boolean;
  isLast: boolean;
  handlers: Handlers;
}) {
  const [open, setOpen] = useState(true);
  const total = countTopics(section);
  const contentId = `section-${section.id}`;
  const hasContent = section.children.length > 0 || section.topics.length > 0;

  return (
    <div className={cn("bg-card rounded-xl border", depth > 1 && "bg-background rounded-lg")} data-testid="section">
      <div className="flex items-center gap-1 py-2 pr-2 pl-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={contentId}
          aria-label={open ? `Collapse ${section.title}` : `Expand ${section.title}`}
          className="text-muted-foreground"
        >
          <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
        </Button>
        <Badge variant="secondary" className="font-normal">
          {section.label}
        </Badge>
        <h3 className={cn("min-w-0 flex-1 truncate font-medium", depth > 1 && "text-sm")}>{section.title}</h3>
        <span className="text-muted-foreground hidden text-xs sm:inline">
          {total} topic{total === 1 ? "" : "s"}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Add a topic to ${section.title}`}
          onClick={() => handlers.addTopic(section.id)}
        >
          <Plus />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${section.title}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => handlers.addTopic(section.id)}>
              <Hash aria-hidden />
              Add topic
            </DropdownMenuItem>
            {depth < MAX_SECTION_DEPTH && (
              <DropdownMenuItem onSelect={() => handlers.addSubsection(section)}>
                <FolderPlus aria-hidden />
                Add section inside
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => handlers.editSection(section)}>
              <Pencil aria-hidden />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={isFirst} onSelect={() => handlers.moveSection(section, "up")}>
              <ArrowUp aria-hidden />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isLast} onSelect={() => handlers.moveSection(section, "down")}>
              <ArrowDown aria-hidden />
              Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => handlers.deleteSection(section)}>
              <Trash2 aria-hidden />
              Delete section
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {open && (
        <div id={contentId} className="pb-2">
          {section.children.length > 0 && (
            <div className="grid gap-2 px-3 pb-2">
              {section.children.map((c, i) => (
                <SectionItem
                  key={c.id}
                  section={c}
                  depth={depth + 1}
                  isFirst={i === 0}
                  isLast={i === section.children.length - 1}
                  handlers={handlers}
                />
              ))}
            </div>
          )}
          {section.topics.length > 0 && <TopicList topics={section.topics} handlers={handlers} />}
          {!hasContent && (
            <p className="text-muted-foreground px-12 pb-2 text-sm">
              No topics yet.{" "}
              <button
                className="text-primary font-medium hover:underline"
                onClick={() => handlers.addTopic(section.id)}
              >
                Add one
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TopicList({ topics, handlers }: { topics: TopicView[]; handlers: Handlers }) {
  return (
    <ul className="grid">
      {topics.map((t, i) => (
        <li key={t.id} className="group hover:bg-accent/50 flex items-start gap-3 px-4 py-2 pl-12" data-testid="topic">
          <Hash className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t.name}</p>
            {t.description && <p className="text-muted-foreground line-clamp-2 text-sm">{t.description}</p>}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`More actions for ${t.name}`}
                className="-my-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => handlers.editTopic(t)}>
                <Pencil aria-hidden />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={i === 0} onSelect={() => handlers.moveTopic(t, "up")}>
                <ArrowUp aria-hidden />
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={i === topics.length - 1} onSelect={() => handlers.moveTopic(t, "down")}>
                <ArrowDown aria-hidden />
                Move down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => handlers.deleteTopic(t)}>
                <Trash2 aria-hidden />
                Delete topic
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      ))}
    </ul>
  );
}
