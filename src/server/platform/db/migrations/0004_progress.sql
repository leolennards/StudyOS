CREATE TABLE "study_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subject_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"focused_seconds" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_sessions_order" CHECK ("study_sessions"."ended_at" >= "study_sessions"."started_at"),
	CONSTRAINT "study_sessions_seconds_range" CHECK ("study_sessions"."focused_seconds" > 0 and "study_sessions"."focused_seconds" <= 86400)
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "daily_goal_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "study_sessions_workspace_idx" ON "study_sessions" USING btree ("workspace_id","started_at");--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_daily_goal_range" CHECK ("user_settings"."daily_goal_minutes" >= 5 and "user_settings"."daily_goal_minutes" <= 720);