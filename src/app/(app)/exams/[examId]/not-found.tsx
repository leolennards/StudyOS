import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";

export default function ExamNotFound() {
  return (
    <PageContainer>
      <EmptyState
        icon={<CalendarClock />}
        title="We couldn't find that exam"
        description="It may have been deleted, or the link might be wrong."
        action={
          <Button asChild>
            <Link href="/exams">Back to exams</Link>
          </Button>
        }
      />
    </PageContainer>
  );
}
