ALTER TABLE "sessions" ADD COLUMN "id" serial NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "kind" text DEFAULT 'cookie' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "expires_at" timestamp with time zone DEFAULT NOW() + INTERVAL '30 days';--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "sessions_user_id" ON "sessions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_kind_check" CHECK ("sessions"."kind" IN ('cookie', 'token', 'personal'));--> statement-breakpoint
-- existing browser sessions keep expiring 30 days after they were created, as before
UPDATE "sessions" SET "expires_at" = "created_at" + INTERVAL '30 days';
