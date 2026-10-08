CREATE TABLE "past_paper_attempt_marks" (
	"workspace_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"awarded" smallint NOT NULL,
	CONSTRAINT "past_paper_attempt_marks_attempt_id_question_id_pk" PRIMARY KEY("attempt_id","question_id"),
	CONSTRAINT "past_paper_attempt_marks_awarded" CHECK ("past_paper_attempt_marks"."awarded" >= 0)
);
--> statement-breakpoint
CREATE TABLE "past_paper_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"paper_id" uuid NOT NULL,
	"taken_on" date NOT NULL,
	"minutes" smallint,
	"score" smallint NOT NULL,
	"out_of" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "past_paper_attempts_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "past_paper_attempts_score" CHECK ("past_paper_attempts"."out_of" > 0 and "past_paper_attempts"."score" between 0 and "past_paper_attempts"."out_of")
);
--> statement-breakpoint
CREATE TABLE "past_paper_question_topics" (
	"workspace_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	CONSTRAINT "past_paper_question_topics_question_id_topic_id_pk" PRIMARY KEY("question_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "past_paper_questions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"paper_id" uuid NOT NULL,
	"number" text NOT NULL,
	"marks" smallint NOT NULL,
	"position" smallint NOT NULL,
	CONSTRAINT "past_paper_questions_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "past_paper_questions_marks" CHECK ("past_paper_questions"."marks" > 0)
);
--> statement-breakpoint
CREATE TABLE "past_papers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" text NOT NULL,
	"year" smallint,
	"duration_min" smallint,
	"total_marks" smallint,
	"document_id" uuid,
	"mark_scheme_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "past_papers_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "past_papers_total_marks" CHECK ("past_papers"."total_marks" is null or "past_papers"."total_marks" > 0)
);
--> statement-breakpoint
ALTER TABLE "past_paper_attempt_marks" ADD CONSTRAINT "past_paper_attempt_marks_attempt_fk" FOREIGN KEY ("workspace_id","attempt_id") REFERENCES "public"."past_paper_attempts"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "past_paper_attempt_marks" ADD CONSTRAINT "past_paper_attempt_marks_question_fk" FOREIGN KEY ("workspace_id","question_id") REFERENCES "public"."past_paper_questions"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "past_paper_attempts" ADD CONSTRAINT "past_paper_attempts_paper_fk" FOREIGN KEY ("workspace_id","paper_id") REFERENCES "public"."past_papers"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "past_paper_question_topics" ADD CONSTRAINT "past_paper_question_topics_question_fk" FOREIGN KEY ("workspace_id","question_id") REFERENCES "public"."past_paper_questions"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "past_paper_question_topics" ADD CONSTRAINT "past_paper_question_topics_topic_fk" FOREIGN KEY ("workspace_id","topic_id") REFERENCES "public"."topics"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "past_paper_questions" ADD CONSTRAINT "past_paper_questions_paper_fk" FOREIGN KEY ("workspace_id","paper_id") REFERENCES "public"."past_papers"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "past_papers" ADD CONSTRAINT "past_papers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "past_papers" ADD CONSTRAINT "past_papers_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "past_papers" ADD CONSTRAINT "past_papers_mark_scheme_id_documents_id_fk" FOREIGN KEY ("mark_scheme_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "past_papers" ADD CONSTRAINT "past_papers_subject_fk" FOREIGN KEY ("workspace_id","subject_id") REFERENCES "public"."subjects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "past_paper_attempt_marks_question_idx" ON "past_paper_attempt_marks" USING btree ("workspace_id","question_id");--> statement-breakpoint
CREATE INDEX "past_paper_attempts_paper_idx" ON "past_paper_attempts" USING btree ("workspace_id","paper_id","taken_on");--> statement-breakpoint
CREATE INDEX "past_paper_question_topics_topic_idx" ON "past_paper_question_topics" USING btree ("workspace_id","topic_id");--> statement-breakpoint
CREATE INDEX "past_paper_questions_paper_idx" ON "past_paper_questions" USING btree ("workspace_id","paper_id","position");--> statement-breakpoint
CREATE INDEX "past_papers_subject_idx" ON "past_papers" USING btree ("workspace_id","subject_id");