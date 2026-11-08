-- reactions made before reactions could be unread count as seen, so the deploy doesn't light up every chat
UPDATE "message_reactions" SET "read_at" = "created_at" WHERE "read_at" IS NULL;--> statement-breakpoint
UPDATE "group_message_reactions" SET "read_at" = "created_at" WHERE "read_at" IS NULL;
