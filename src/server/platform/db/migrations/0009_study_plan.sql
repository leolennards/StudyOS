CREATE TABLE "plan_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"day" date NOT NULL,
	"position" smallint NOT NULL,
	"kind" text NOT NULL,
	"minutes" smallint NOT NULL,
	"deadline_id" uuid,
	"topic_id" uuid,
	"paper_id" uuid,
	"cards" integer,
	"status" text DEFAULT 'todo' NOT NULL,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_items_kind" CHECK ("plan_items"."kind" in ('review', 'topic', 'paper', 'assignment')),
	CONSTRAINT "plan_items_status" CHECK ("plan_items"."status" in ('todo', 'done', 'skipped')),
	CONSTRAINT "plan_items_minutes" CHECK ("plan_items"."minutes" between 1 and 720)
);
--> statement-breakpoint
CREATE TABLE "study_plans" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"week_minutes" integer[] NOT NULL,
	"starts_on" date,
	"planned_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_plans_week_minutes" CHECK (cardinality("study_plans"."week_minutes") = 7),
	CONSTRAINT "study_plans_week_minutes_range" CHECK (0 <= all("study_plans"."week_minutes") and 720 >= all("study_plans"."week_minutes"))
);
--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_deadline_fk" FOREIGN KEY ("workspace_id","deadline_id") REFERENCES "public"."deadlines"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_topic_fk" FOREIGN KEY ("workspace_id","topic_id") REFERENCES "public"."topics"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_paper_fk" FOREIGN KEY ("workspace_id","paper_id") REFERENCES "public"."past_papers"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_items_workspace_day_idx" ON "plan_items" USING btree ("workspace_id","day","position");