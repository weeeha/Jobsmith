CREATE TABLE "company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"domain" text,
	"careers_url" text,
	"ats_kind" text,
	"ats_org" text,
	"size" text,
	"industry" text,
	"hq" text,
	"notes_md" text,
	"tracked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "company_user_name_key_unique" UNIQUE("user_id","name_key"),
	CONSTRAINT "company_ats_kind_check" CHECK ("company"."ats_kind" in ('greenhouse', 'ashby', 'lever', 'other'))
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"stage_id" uuid,
	"kind" text NOT NULL,
	"body" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_kind_check" CHECK ("event"."kind" in ('created', 'stage_moved', 'closed', 'reopened', 'note', 'interview_scheduled', 'document_sent', 'artifact_pushed', 'next_action_done'))
);
--> statement-breakpoint
CREATE TABLE "opportunity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"company_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"role_title" text NOT NULL,
	"location" text,
	"work_mode" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_url" text,
	"posting_md" text,
	"posting_captured_at" timestamp with time zone,
	"comp_min" integer,
	"comp_max" integer,
	"comp_currency" text,
	"comp_note" text,
	"my_ask" text,
	"fit_score" integer,
	"fit" jsonb,
	"fit_status" text DEFAULT 'none' NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"current_stage_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"closed_reason" text,
	"closed_at" timestamp with time zone,
	"closed_stage_id" uuid,
	"next_action" text,
	"next_action_at" timestamp with time zone,
	"dedupe_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "opportunity_user_slug_unique" UNIQUE("user_id","slug"),
	CONSTRAINT "opportunity_work_mode_check" CHECK ("opportunity"."work_mode" in ('remote', 'hybrid', 'onsite')),
	CONSTRAINT "opportunity_source_check" CHECK ("opportunity"."source" in ('url', 'text', 'manual', 'feed')),
	CONSTRAINT "opportunity_fit_status_check" CHECK ("opportunity"."fit_status" in ('none', 'pending', 'done', 'failed')),
	CONSTRAINT "opportunity_status_check" CHECK ("opportunity"."status" in ('active', 'closed')),
	CONSTRAINT "opportunity_closed_reason_check" CHECK ("opportunity"."closed_reason" in ('rejected', 'withdrawn', 'ghosted', 'declined', 'accepted')),
	CONSTRAINT "opportunity_fit_score_check" CHECK ("opportunity"."fit_score" is null or ("opportunity"."fit_score" >= 0 and "opportunity"."fit_score" <= 100)),
	CONSTRAINT "opportunity_closed_consistency" CHECK (("opportunity"."status" = 'closed') = ("opportunity"."closed_reason" is not null and "opportunity"."closed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "opportunity_person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" text DEFAULT 'other' NOT NULL,
	"stage_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_person_opportunity_person_unique" UNIQUE("opportunity_id","person_id"),
	CONSTRAINT "opportunity_person_role_check" CHECK ("opportunity_person"."role" in ('recruiter', 'hiring_manager', 'interviewer', 'referrer', 'other'))
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"linkedin_url" text,
	"email" text,
	"notes_md" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_user_id_id_unique" UNIQUE("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "stage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"format" text,
	"entered_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"outcome_md" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stage_user_id_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "stage_opportunity_position_unique" UNIQUE("opportunity_id","position"),
	CONSTRAINT "stage_kind_check" CHECK ("stage"."kind" in ('saved', 'applied', 'recruiter_screen', 'hiring_manager', 'portfolio_case', 'panel_final', 'offer')),
	CONSTRAINT "stage_status_check" CHECK ("stage"."status" in ('upcoming', 'scheduled', 'done', 'skipped')),
	CONSTRAINT "stage_format_check" CHECK ("stage"."format" in ('phone', 'video', 'onsite', 'async'))
);
--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_stage_id_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stage"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_opportunity_fk" FOREIGN KEY ("user_id","opportunity_id") REFERENCES "public"."opportunity"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_current_stage_id_stage_id_fk" FOREIGN KEY ("current_stage_id") REFERENCES "public"."stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_closed_stage_id_stage_id_fk" FOREIGN KEY ("closed_stage_id") REFERENCES "public"."stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity" ADD CONSTRAINT "opportunity_company_fk" FOREIGN KEY ("user_id","company_id") REFERENCES "public"."company"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_person" ADD CONSTRAINT "opportunity_person_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_person" ADD CONSTRAINT "opportunity_person_stage_id_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stage"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_person" ADD CONSTRAINT "opportunity_person_opportunity_fk" FOREIGN KEY ("user_id","opportunity_id") REFERENCES "public"."opportunity"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_person" ADD CONSTRAINT "opportunity_person_person_fk" FOREIGN KEY ("user_id","person_id") REFERENCES "public"."person"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_company_fk" FOREIGN KEY ("user_id","company_id") REFERENCES "public"."company"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage" ADD CONSTRAINT "stage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage" ADD CONSTRAINT "stage_opportunity_fk" FOREIGN KEY ("user_id","opportunity_id") REFERENCES "public"."opportunity"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_opportunity_occurred_idx" ON "event" USING btree ("opportunity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "opportunity_user_status_idx" ON "opportunity" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "opportunity_company_idx" ON "opportunity" USING btree ("company_id");