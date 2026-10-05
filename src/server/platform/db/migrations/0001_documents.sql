ALTER TABLE "topics" ADD CONSTRAINT "topics_workspace_id_id_key" UNIQUE("workspace_id","id");--> statement-breakpoint
CREATE TYPE "public"."document_format" AS ENUM('pdf', 'docx', 'pptx', 'txt', 'md', 'png', 'jpeg', 'webp');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('lecture', 'notes', 'textbook', 'past_paper', 'mark_scheme', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_preview" AS ENUM('pdf', 'image', 'text');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('pending_upload', 'uploaded', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "document_pages" (
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"text" text NOT NULL,
	"blocks" jsonb,
	"char_count" integer NOT NULL,
	"ocr_used" boolean DEFAULT false NOT NULL,
	"ocr_confidence" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_pages_document_id_page_number_pk" PRIMARY KEY("document_id","page_number"),
	CONSTRAINT "document_pages_number_positive" CHECK ("document_pages"."page_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "document_topics" (
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_topics_document_id_topic_id_pk" PRIMARY KEY("document_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" text NOT NULL,
	"original_filename" text NOT NULL,
	"kind" "document_kind" NOT NULL,
	"format" "document_format" NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"status" "document_status" DEFAULT 'pending_upload' NOT NULL,
	"stage" text,
	"progress" smallint DEFAULT 0 NOT NULL,
	"error_message" text,
	"page_count" integer,
	"ocr_page_count" integer DEFAULT 0 NOT NULL,
	"preview" "document_preview",
	"storage_key" text NOT NULL,
	"preview_key" text,
	"uploaded_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "documents_progress_range" CHECK ("documents"."progress" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_document_fk" FOREIGN KEY ("workspace_id","document_id") REFERENCES "public"."documents"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_topics" ADD CONSTRAINT "document_topics_document_fk" FOREIGN KEY ("workspace_id","document_id") REFERENCES "public"."documents"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_topics" ADD CONSTRAINT "document_topics_topic_fk" FOREIGN KEY ("workspace_id","topic_id") REFERENCES "public"."topics"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_subject_fk" FOREIGN KEY ("workspace_id","subject_id") REFERENCES "public"."subjects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_topics_topic_idx" ON "document_topics" USING btree ("workspace_id","topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_workspace_sha256_key" ON "documents" USING btree ("workspace_id","sha256");--> statement-breakpoint
CREATE INDEX "documents_subject_idx" ON "documents" USING btree ("workspace_id","subject_id","created_at");