import Link from "next/link";
import type { Metadata } from "next";
import { Library } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { NewSubjectButton } from "@/features/knowledge/new-subject-button";
import { SubjectCard } from "@/features/knowledge/subject-card";
import { cn } from "@/lib/utils";
import { requirePageSession } from "@/server/platform/auth/session";
import { knowledgeService } from "@/server/modules/knowledge/service";

export const metadata: Metadata = { title: "Subjects" };

export default async function SubjectsPage({ searchParams }: PageProps<"/subjects">) {
  const { ctx } = await requirePageSession();
  const { view } = await searchParams;
  const archived = view === "archived";
  const subjects = await knowledgeService.listSubjects(ctx, { archived });

  return (
    <PageContainer>
      <PageHeader
        title="Subjects"
        description="Each subject holds its sections and topics. Notes, documents and practice will live here too."
        actions={<NewSubjectButton />}
      />

      <nav aria-label="Subject filter" className="mt-6 flex gap-1 border-b">
        {[
          { href: "/subjects", label: "Active", current: !archived },
          { href: "/subjects?view=archived", label: "Archived", current: archived },
        ].map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.current ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring/50 -mb-px border-b-2 px-3 py-2 text-sm outline-none focus-visible:ring-[3px]",
              tab.current
                ? "border-primary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {subjects.length === 0 ? (
          archived ? (
            <EmptyState
              icon={<Library />}
              title="No archived subjects"
              description="Subjects you archive at the end of a term appear here."
            />
          ) : (
            <EmptyState
              icon={<Library />}
              title="Add your first subject"
              description="Start with one course you're taking this term. You can add its modules, chapters and topics next."
              action={<NewSubjectButton />}
            />
          )
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((s) => (
              <li key={s.id}>
                <SubjectCard subject={s} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}
