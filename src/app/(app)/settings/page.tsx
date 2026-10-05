import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/shared/page-header";
import { Separator } from "@/components/ui/separator";
import { PreferencesForm } from "@/features/settings/preferences-form";
import { ProfileForm } from "@/features/settings/profile-form";
import { ReviewSettingsForm } from "@/features/settings/review-settings-form";
import { ChangePasswordForm, DeleteAccount } from "@/features/settings/security-section";
import { requirePageSession } from "@/server/platform/auth/session";
import { settingsService } from "@/server/modules/settings/service";

export const metadata: Metadata = { title: "Settings" };

function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid gap-6 py-8 md:grid-cols-[16rem_1fr]">
      <div>
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const { user, ctx } = await requirePageSession();
  const [settings, hasPassword] = await Promise.all([settingsService.get(ctx), settingsService.hasPassword(ctx)]);

  return (
    <PageContainer>
      <PageHeader title="Settings" description="Your profile, preferences and account." />
      <div className="mt-2">
        <SettingsSection id="profile-heading" title="Profile" description="How you appear in StudyOS.">
          <ProfileForm name={user.name} email={user.email} />
        </SettingsSection>
        <Separator />
        <SettingsSection id="prefs-heading" title="Preferences" description="Appearance and time zone.">
          <PreferencesForm timezone={settings.timezone} theme={settings.theme} />
        </SettingsSection>
        <Separator />
        <SettingsSection
          id="review-heading"
          title="Flashcard review"
          description="How spaced repetition schedules your cards. Days start at midnight in your time zone."
        >
          <ReviewSettingsForm
            desiredRetention={settings.desiredRetention}
            newCardsPerDay={settings.newCardsPerDay}
            reviewsPerDay={settings.reviewsPerDay}
          />
        </SettingsSection>
        <Separator />
        {hasPassword && (
          <>
            <SettingsSection
              id="password-heading"
              title="Password"
              description="Changing it signs out your other devices."
            >
              <ChangePasswordForm />
            </SettingsSection>
            <Separator />
          </>
        )}
        <SettingsSection
          id="danger-heading"
          title="Delete account"
          description="Permanently delete your account and all of your study data."
        >
          <DeleteAccount hasPassword={hasPassword} />
        </SettingsSection>
      </div>
    </PageContainer>
  );
}
