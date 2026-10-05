import Link from "next/link";
import { FileText } from "lucide-react";
import { PageContainer } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default function DocumentNotFound() {
  return (
    <PageContainer>
      <EmptyState
        icon={<FileText />}
        title="We couldn't find that document"
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
