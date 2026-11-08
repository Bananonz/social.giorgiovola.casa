ALTER TABLE "group_message_reactions" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "group_message_reactions_unread" ON "group_message_reactions" USING btree ("message_id") WHERE "group_message_reactions"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX "message_reactions_unread" ON "message_reactions" USING btree ("message_id") WHERE "message_reactions"."read_at" IS NULL;