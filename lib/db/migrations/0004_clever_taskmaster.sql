CREATE TABLE "prep_mark" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"scope" text NOT NULL,
	"opportunity_id" uuid,
	"question_key" text NOT NULL,
	"level" text NOT NULL,
	"marked_at" timestamp with time zone NOT NULL,
	"drill_count" integer DEFAULT 0 NOT NULL,
	"last_drilled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prep_mark_scope_check" CHECK ("prep_mark"."scope" in ('job', 'library')),
	CONSTRAINT "prep_mark_level_check" CHECK ("prep_mark"."level" in ('shaky', 'okay', 'solid'))
);
--> statement-breakpoint
CREATE TABLE "prep_question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"artifact_version" integer NOT NULL,
	"artifact_key" text NOT NULL,
	"stage_id" uuid,
	"section" text,
	"number" integer NOT NULL,
	"position" integer NOT NULL,
	"question" text NOT NULL,
	"question_key" text NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"spine" text,
	"last_line" text,
	"guard" text,
	"unfilled" boolean DEFAULT false NOT NULL,
	"has_answer" boolean DEFAULT false NOT NULL,
	"unresolved_includes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prep_question_artifact_position_unique" UNIQUE("artifact_id","position")
);
--> statement-breakpoint
CREATE TABLE "prep_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"opportunity_id" uuid,
	"mode" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"questions" integer DEFAULT 0 NOT NULL,
	"marked" integer DEFAULT 0 NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prep_session_mode_check" CHECK ("prep_session"."mode" in ('listen', 'drill', 'quick_fire'))
);
--> statement-breakpoint
CREATE TABLE "library_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"question_key" text,
	"source_opportunity_id" uuid,
	"source_artifact_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_item_kind_check" CHECK ("library_item"."kind" in ('answer', 'story', 'intro', 'fact'))
);
--> statement-breakpoint
CREATE TABLE "asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"duration_ms" integer,
	"opportunity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "asset_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "asset_kind_check" CHECK ("asset"."kind" in ('tts_segment', 'recording', 'other'))
);
--> statement-breakpoint
CREATE TABLE "tts_segment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"hash" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"voice" text NOT NULL,
	"style" text NOT NULL,
	"text_chars" integer NOT NULL,
	"asset_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_code" text,
	"suspect" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tts_segment_user_hash_unique" UNIQUE("user_id","hash"),
	CONSTRAINT "tts_segment_status_check" CHECK ("tts_segment"."status" in ('pending', 'done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "event" DROP CONSTRAINT "event_kind_check";--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "prep" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "prep_mark" ADD CONSTRAINT "prep_mark_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_mark" ADD CONSTRAINT "prep_mark_opportunity_fk" FOREIGN KEY ("user_id","opportunity_id") REFERENCES "public"."opportunity"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_question" ADD CONSTRAINT "prep_question_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_question" ADD CONSTRAINT "prep_question_stage_id_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stage"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_question" ADD CONSTRAINT "prep_question_artifact_fk" FOREIGN KEY ("user_id","artifact_id") REFERENCES "public"."artifact"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_question" ADD CONSTRAINT "prep_question_opportunity_fk" FOREIGN KEY ("user_id","opportunity_id") REFERENCES "public"."opportunity"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_session" ADD CONSTRAINT "prep_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_session" ADD CONSTRAINT "prep_session_opportunity_fk" FOREIGN KEY ("user_id","opportunity_id") REFERENCES "public"."opportunity"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_source_opportunity_id_opportunity_id_fk" FOREIGN KEY ("source_opportunity_id") REFERENCES "public"."opportunity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_item" ADD CONSTRAINT "library_item_source_artifact_id_artifact_id_fk" FOREIGN KEY ("source_artifact_id") REFERENCES "public"."artifact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset" ADD CONSTRAINT "asset_opportunity_id_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tts_segment" ADD CONSTRAINT "tts_segment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tts_segment" ADD CONSTRAINT "tts_segment_asset_fk" FOREIGN KEY ("user_id","asset_id") REFERENCES "public"."asset"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prep_mark_user_idx" ON "prep_mark" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prep_mark_scope_key_unique" ON "prep_mark" USING btree ("user_id","scope",coalesce("opportunity_id"::text, ''),"question_key");--> statement-breakpoint
CREATE INDEX "prep_question_job_key_idx" ON "prep_question" USING btree ("user_id","opportunity_id","artifact_key");--> statement-breakpoint
CREATE INDEX "prep_question_user_question_key_idx" ON "prep_question" USING btree ("user_id","question_key");--> statement-breakpoint
CREATE INDEX "prep_session_user_opportunity_idx" ON "prep_session" USING btree ("user_id","opportunity_id");--> statement-breakpoint
CREATE INDEX "library_item_user_idx" ON "library_item" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "library_item_user_question_key_idx" ON "library_item" USING btree ("user_id","question_key");--> statement-breakpoint
CREATE INDEX "asset_user_idx" ON "asset" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_kind_check" CHECK ("event"."kind" in ('created', 'stage_moved', 'closed', 'reopened', 'note', 'interview_scheduled', 'document_sent', 'artifact_pushed', 'next_action_done', 'prep_drilled'));