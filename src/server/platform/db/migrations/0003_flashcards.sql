CREATE TYPE "public"."card_learning_state" AS ENUM('new', 'learning', 'review', 'relearning');--> statement-breakpoint
CREATE TYPE "public"."card_origin" AS ENUM('user', 'ai', 'imported');--> statement-breakpoint
CREATE TYPE "public"."card_type" AS ENUM('basic', 'reverse', 'cloze');--> statement-breakpoint
CREATE TABLE "card_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"ordinal" smallint NOT NULL,
	"rating" smallint NOT NULL,
	"state_before" "card_learning_state" NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	"elapsed_days" integer NOT NULL,
	"scheduled_days" integer NOT NULL,
	"duration_ms" integer,
	"previous" jsonb NOT NULL,
	CONSTRAINT "card_reviews_rating_range" CHECK ("card_reviews"."rating" between 1 and 4)
);
--> statement-breakpoint
CREATE TABLE "card_states" (
	"workspace_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"ordinal" smallint NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"stability" double precision DEFAULT 0 NOT NULL,
	"difficulty" double precision DEFAULT 0 NOT NULL,
	"elapsed_days" integer DEFAULT 0 NOT NULL,
	"scheduled_days" integer DEFAULT 0 NOT NULL,
	"learning_steps" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"state" "card_learning_state" DEFAULT 'new' NOT NULL,
	"last_review" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_states_card_id_ordinal_pk" PRIMARY KEY("card_id","ordinal"),
	CONSTRAINT "card_states_ordinal_range" CHECK ("card_states"."ordinal" >= 0 and "card_states"."ordinal" <= 99)
);
--> statement-breakpoint
CREATE TABLE "card_topics" (
	"workspace_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_topics_card_id_topic_id_pk" PRIMARY KEY("card_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"type" "card_type" NOT NULL,
	"front" text NOT NULL,
	"back" text DEFAULT '' NOT NULL,
	"origin" "card_origin" DEFAULT 'user' NOT NULL,
	"source_note_id" uuid,
	"source_document_id" uuid,
	"source_page" integer,
	"suspended_at" timestamp with time zone,
	"search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(front, '')), 'A') || setweight(to_tsvector('english', coalesce(back, '')), 'B')) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cards_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "cards_source_page_positive" CHECK ("cards"."source_page" is null or "cards"."source_page" > 0)
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "desired_retention" double precision DEFAULT 0.9 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "new_cards_per_day" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "reviews_per_day" integer DEFAULT 200 NOT NULL;--> statement-breakpoint
ALTER TABLE "card_reviews" ADD CONSTRAINT "card_reviews_card_fk" FOREIGN KEY ("workspace_id","card_id") REFERENCES "public"."cards"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_states" ADD CONSTRAINT "card_states_card_fk" FOREIGN KEY ("workspace_id","card_id") REFERENCES "public"."cards"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_topics" ADD CONSTRAINT "card_topics_card_fk" FOREIGN KEY ("workspace_id","card_id") REFERENCES "public"."cards"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_topics" ADD CONSTRAINT "card_topics_topic_fk" FOREIGN KEY ("workspace_id","topic_id") REFERENCES "public"."topics"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_source_note_id_notes_id_fk" FOREIGN KEY ("source_note_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_subject_fk" FOREIGN KEY ("workspace_id","subject_id") REFERENCES "public"."subjects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_reviews_item_idx" ON "card_reviews" USING btree ("card_id","ordinal","reviewed_at");--> statement-breakpoint
CREATE INDEX "card_reviews_day_idx" ON "card_reviews" USING btree ("workspace_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "card_states_due_idx" ON "card_states" USING btree ("workspace_id","state","due");--> statement-breakpoint
CREATE INDEX "card_topics_topic_idx" ON "card_topics" USING btree ("workspace_id","topic_id");--> statement-breakpoint
CREATE INDEX "cards_subject_idx" ON "cards" USING btree ("workspace_id","subject_id","created_at");--> statement-breakpoint
CREATE INDEX "cards_search_idx" ON "cards" USING gin ("search_vector");--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_retention_range" CHECK ("user_settings"."desired_retention" >= 0.7 and "user_settings"."desired_retention" <= 0.97);--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_new_cards_range" CHECK ("user_settings"."new_cards_per_day" >= 0 and "user_settings"."new_cards_per_day" <= 500);--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_reviews_range" CHECK ("user_settings"."reviews_per_day" >= 0 and "user_settings"."reviews_per_day" <= 9999);