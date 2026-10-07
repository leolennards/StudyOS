CREATE TABLE "card_imports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_imports_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "card_imports_source_check" CHECK ("card_imports"."source" in ('anki', 'quizlet', 'text'))
);
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "card_imports" ADD CONSTRAINT "card_imports_subject_fk" FOREIGN KEY ("workspace_id","subject_id") REFERENCES "public"."subjects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_imports_subject_idx" ON "card_imports" USING btree ("workspace_id","subject_id","created_at");--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_import_fk" FOREIGN KEY ("workspace_id","import_id") REFERENCES "public"."card_imports"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cards_import_idx" ON "cards" USING btree ("workspace_id","import_id");