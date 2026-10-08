ALTER TYPE "public"."card_type" ADD VALUE 'image_occlusion';--> statement-breakpoint
CREATE TABLE "card_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_images_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "card_images_status_check" CHECK ("card_images"."status" in ('pending', 'ready')),
	CONSTRAINT "card_images_size_check" CHECK ("card_images"."size_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "front_image_id" uuid;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "back_image_id" uuid;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "occlusions" jsonb;--> statement-breakpoint
ALTER TABLE "card_images" ADD CONSTRAINT "card_images_subject_fk" FOREIGN KEY ("workspace_id","subject_id") REFERENCES "public"."subjects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "card_images_created_idx" ON "card_images" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_front_image_fk" FOREIGN KEY ("workspace_id","front_image_id") REFERENCES "public"."card_images"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_back_image_fk" FOREIGN KEY ("workspace_id","back_image_id") REFERENCES "public"."card_images"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_occlusions_check" CHECK (("cards"."type"::text = 'image_occlusion') = ("cards"."occlusions" is not null and "cards"."front_image_id" is not null));