-- Trigram matching for typo-tolerant title search (Architecture §31). Available on Neon and in the stock Postgres images.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."note_origin" AS ENUM('user', 'ai', 'imported');--> statement-breakpoint
CREATE TABLE "note_topics" (
	"workspace_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "note_topics_note_id_topic_id_pk" PRIMARY KEY("note_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"section_id" uuid,
	"title" text DEFAULT '' NOT NULL,
	"content" jsonb NOT NULL,
	"content_text" text DEFAULT '' NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"origin" "note_origin" DEFAULT 'user' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(content_text, '')), 'B')) STORED NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "notes_revision_positive" CHECK ("notes"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "document_pages" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', text)) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "note_topics" ADD CONSTRAINT "note_topics_note_fk" FOREIGN KEY ("workspace_id","note_id") REFERENCES "public"."notes"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_topics" ADD CONSTRAINT "note_topics_topic_fk" FOREIGN KEY ("workspace_id","topic_id") REFERENCES "public"."topics"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_subject_fk" FOREIGN KEY ("workspace_id","subject_id") REFERENCES "public"."subjects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_topics_topic_idx" ON "note_topics" USING btree ("workspace_id","topic_id");--> statement-breakpoint
CREATE INDEX "notes_subject_idx" ON "notes" USING btree ("workspace_id","subject_id","deleted_at","updated_at");--> statement-breakpoint
CREATE INDEX "notes_search_idx" ON "notes" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "notes_title_trgm_idx" ON "notes" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "document_pages_search_idx" ON "document_pages" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "documents_title_trgm_idx" ON "documents" USING gin ("title" gin_trgm_ops);