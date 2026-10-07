"use client";

import Link from "next/link";
import { useState } from "react";
import { GalleryVerticalEnd, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TopicGroup } from "@/features/knowledge/topic-groups";
import type { ConfidenceLevel } from "@/server/modules/planner/domain/exams";
import { ConfidencePicker } from "./confidence-picker";
import { TopicsPickerDialog } from "./topics-picker-dialog";

export type TopicStanding = { confidence: ConfidenceLevel | null; cards: number; recall: number | null };

function studyLine(s: TopicStanding | undefined) {
  if (!s || s.cards === 0) return "No flashcards yet";
  const cards = `${s.cards} card${s.cards === 1 ? "" : "s"}`;
  return s.recall === null ? cards : `${cards} · ${Math.round(s.recall * 100)}% remembered this month`;
}

/**
 * The exam's topic checklist: each covered topic with the student's
 * confidence and their flashcard recall, grouped by section.
 */
export function ExamTopics({
  deadlineId,
  subjectId,
  groups,
  covered,
  coversWholeSubject,
  standings,
}: {
  deadlineId: string;
  subjectId: string;
  groups: TopicGroup[];
  covered: string[];
  coversWholeSubject: boolean;
  standings: Record<string, TopicStanding>;
}) {
  const [picking, setPicking] = useState(false);
  const coveredSet = new Set(covered);
  const shown = groups
    .map((g) => ({ ...g, topics: g.topics.filter((t) => coveredSet.has(t.id)) }))
    .filter((g) => g.topics.length > 0);
  const sectioned = groups.length > 1;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1.5">
          <CardTitle>
            <h2>Topics</h2>
          </CardTitle>
          <CardDescription>
            {coversWholeSubject
              ? "Everything in the subject. Rate each topic as you revise."
              : `${covered.length} topic${covered.length === 1 ? "" : "s"} picked. Rate each one as you revise.`}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
          <ListChecks aria-hidden />
          Choose topics
        </Button>
      </CardHeader>
      <CardContent className="grid gap-6">
        {shown.map((g) => (
          <section key={g.label} aria-label={sectioned ? g.label : undefined}>
            {sectioned && (
              <h3 className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">{g.label}</h3>
            )}
            <ul className="divide-y">
              {g.topics.map((t) => {
                const s = standings[t.id];
                return (
                  <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{t.name}</p>
                        <p className="text-muted-foreground text-xs">{studyLine(s)}</p>
                      </div>
                      {s && s.cards > 0 && (
                        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                          <Link href={`/review?subject=${subjectId}&topic=${t.id}`} aria-label={`Review ${t.name}`}>
                            <GalleryVerticalEnd aria-hidden />
                            Review
                          </Link>
                        </Button>
                      )}
                    </div>
                    <ConfidencePicker topicId={t.id} topicName={t.name} level={s?.confidence ?? null} />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </CardContent>
      <TopicsPickerDialog
        open={picking}
        onOpenChange={setPicking}
        deadlineId={deadlineId}
        groups={groups}
        coversWholeSubject={coversWholeSubject}
        selected={coversWholeSubject ? [] : covered}
      />
    </Card>
  );
}
