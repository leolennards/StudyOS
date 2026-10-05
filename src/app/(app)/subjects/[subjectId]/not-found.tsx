import Link from "next/link";
import { PageContainer } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Library } from "lucide-react";

export default function SubjectNotFound() {
  return (
    <PageContainer>
      <EmptyState
        icon={<Library />}
        title="We couldn't find that subject"
        description="It may have been deleted, or the link might be wrong."
        action={
          <Button asChild>
            <Link href="/subjects">Back to subjects</Link>
          </Button>
        }
      />
    </PageContainer>
  );
}
