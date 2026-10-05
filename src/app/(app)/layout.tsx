import { cookies } from "next/headers";
import { AppShell } from "@/components/shared/app-shell";
import { ThemeSync } from "@/components/shared/theme-sync";
import { requirePageSession } from "@/server/platform/auth/session";
import { knowledgeService } from "@/server/modules/knowledge/service";
import { settingsService } from "@/server/modules/settings/service";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user, ctx } = await requirePageSession();
  const [subjects, settings, cookieStore] = await Promise.all([
    knowledgeService.listSubjects(ctx),
    settingsService.get(ctx),
    cookies(),
  ]);
  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      subjects={subjects.map((s) => ({ id: s.id, name: s.name, colour: s.colour }))}
      initialCollapsed={cookieStore.get("sidebar_collapsed")?.value === "1"}
    >
      <ThemeSync theme={settings.theme} />
      {children}
    </AppShell>
  );
}
