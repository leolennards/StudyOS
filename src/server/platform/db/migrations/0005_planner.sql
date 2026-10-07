CREATE TABLE "deadline_topics" (
	"workspace_id" uuid NOT NULL,
	"deadline_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	CONSTRAINT "deadline_topics_deadline_id_topic_id_pk" PRIMARY KEY("deadline_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "deadlines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subject_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"due_on" date NOT NULL,
	"starts_at" time,
	"location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deadlines_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "deadlines_kind" CHECK ("deadlines"."kind" in ('exam', 'test', 'assignment'))
);
--> statement-breakpoint
CREATE TABLE "topic_confidence" (
	"workspace_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"level" smallint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topic_confidence_workspace_id_topic_id_pk" PRIMARY KEY("workspace_id","topic_id"),
	CONSTRAINT "topic_confidence_level" CHECK ("topic_confidence"."level" between 1 and 3)
);
--> statement-breakpoint
ALTER TABLE "deadline_topics" ADD CONSTRAINT "deadline_topics_deadline_fk" FOREIGN KEY ("workspace_id","deadline_id") REFERENCES "public"."deadlines"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_topics" ADD CONSTRAINT "deadline_topics_topic_fk" FOREIGN KEY ("workspace_id","topic_id") REFERENCES "public"."topics"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_subject_fk" FOREIGN KEY ("workspace_id","subject_id") REFERENCES "public"."subjects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_confidence" ADD CONSTRAINT "topic_confidence_topic_fk" FOREIGN KEY ("workspace_id","topic_id") REFERENCES "public"."topics"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deadline_topics_topic_idx" ON "deadline_topics" USING btree ("workspace_id","topic_id");--> statement-breakpoint
CREATE INDEX "deadlines_workspace_idx" ON "deadlines" USING btree ("workspace_id","due_on");