CREATE TABLE "artifact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"opportunity_id" uuid,
	"company_id" uuid,
	"stage_id" uuid,
	"key" text NOT NULL,
	"version" integer NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"content_hash" text NOT NULL,
	"source_hash" text,
	"origin" text NOT NULL,
	"edited_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "artifact_scope_check" CHECK (("artifact"."opportunity_id" is null) <> ("artifact"."company_id" is null)),
	CONSTRAINT "artifact_company_stage_check" CHECK ("artifact"."company_id" is null or "artifact"."stage_id" is null),
	CONSTRAINT "artifact_version_check" CHECK ("artifact"."version" >= 1),
	CONSTRAINT "artifact_kind_check" CHECK ("artifact"."kind" in ('research', 'fit_brief', 'people_notes', 'cv', 'cover_letter', 'message_draft', 'question_bank', 'call_card', 'pitch', 'glossary', 'debrief', 'other')),
	CONSTRAINT "artifact_origin_check" CHECK ("artifact"."origin" in ('pushed', 'pasted', 'manual', 'generated'))
);
--> statement-breakpoint
CREATE TABLE "api_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"rate_window_start" timestamp with time zone,
	"rate_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_stage_id_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stage"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_opportunity_fk" FOREIGN KEY ("user_id","opportunity_id") REFERENCES "public"."opportunity"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_company_fk" FOREIGN KEY ("user_id","company_id") REFERENCES "public"."company"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_token" ADD CONSTRAINT "api_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_opportunity_key_version_unique" ON "artifact" USING btree ("opportunity_id","key","version") WHERE "artifact"."opportunity_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_company_key_version_unique" ON "artifact" USING btree ("company_id","key","version") WHERE "artifact"."company_id" is not null;--> statement-breakpoint
CREATE INDEX "api_token_user_idx" ON "api_token" USING btree ("user_id");