CREATE TABLE "quiz_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subject_id" uuid,
	"topic_id" uuid,
	"deadline_id" uuid,
	"format" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "quiz_attempts_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "quiz_attempts_format" CHECK ("quiz_attempts"."format" in ('choice', 'typed', 'mixed'))
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"workspace_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"card_id" uuid NOT NULL,
	"ordinal" smallint NOT NULL,
	"kind" text NOT NULL,
	"expected" text NOT NULL,
	"options" jsonb,
	"given" text,
	"correct" boolean,
	"close" boolean DEFAULT false NOT NULL,
	"marked_by" text,
	"answered_at" timestamp with time zone,
	"duration_ms" integer,
	CONSTRAINT "quiz_questions_attempt_id_position_pk" PRIMARY KEY("attempt_id","position"),
	CONSTRAINT "quiz_questions_kind" CHECK ("quiz_questions"."kind" in ('choice', 'typed', 'self')),
	CONSTRAINT "quiz_questions_answered" CHECK (("quiz_questions"."answered_at" is null) = ("quiz_questions"."correct" is null)),
	CONSTRAINT "quiz_questions_position_range" CHECK ("quiz_questions"."position" >= 0 and "quiz_questions"."position" < 100)
);
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_deadline_id_deadlines_id_fk" FOREIGN KEY ("deadline_id") REFERENCES "public"."deadlines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_subject_fk" FOREIGN KEY ("workspace_id","subject_id") REFERENCES "public"."subjects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_attempt_fk" FOREIGN KEY ("workspace_id","attempt_id") REFERENCES "public"."quiz_attempts"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_card_fk" FOREIGN KEY ("workspace_id","card_id") REFERENCES "public"."cards"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_attempts_workspace_idx" ON "quiz_attempts" USING btree ("workspace_id","started_at");--> statement-breakpoint
CREATE INDEX "quiz_questions_card_idx" ON "quiz_questions" USING btree ("workspace_id","card_id");--> statement-breakpoint
CREATE INDEX "quiz_questions_answered_idx" ON "quiz_questions" USING btree ("workspace_id","answered_at");