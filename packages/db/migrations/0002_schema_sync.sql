-- ─── Task 1: Sync migration with current Drizzle schema ─────────────────────
-- Adds everything present in the ORM schema but missing from 0000 + 0001.

-- ─── 1. exercises: replace old columns with simplified schema ─────────────────
ALTER TABLE "exercises"
  DROP COLUMN IF EXISTS "category",
  DROP COLUMN IF EXISTS "primary_muscles",
  DROP COLUMN IF EXISTS "secondary_muscles",
  DROP COLUMN IF EXISTS "equipment",
  DROP COLUMN IF EXISTS "is_custom",
  DROP COLUMN IF EXISTS "created_by",
  DROP COLUMN IF EXISTS "instructions",
  DROP COLUMN IF EXISTS "updated_at";
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "muscle" AS ENUM (
    'chest','upper_chest','lower_chest','back','lats','upper_back','lower_back',
    'traps','anterior_deltoids','lateral_deltoids','posterior_deltoids',
    'biceps','triceps','forearms','core','obliques','glutes',
    'quadriceps','hamstrings','calves','soleus','hip_flexors','adductors',
    'full_body','other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "exercises"
  ADD COLUMN IF NOT EXISTS "primary_muscle" muscle NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS "secondary_muscles" muscle[] NOT NULL DEFAULT '{}'::muscle[];
--> statement-breakpoint

-- ─── 2. exercise_sets: drop unused rpe column ─────────────────────────────────
ALTER TABLE "exercise_sets"
  DROP COLUMN IF EXISTS "rpe";
--> statement-breakpoint

-- ─── 3. exercise_entries: add target columns ──────────────────────────────────
ALTER TABLE "exercise_entries"
  ADD COLUMN IF NOT EXISTS "target_rep_min" integer,
  ADD COLUMN IF NOT EXISTS "target_rep_max" integer,
  ADD COLUMN IF NOT EXISTS "target_rir" integer,
  ADD COLUMN IF NOT EXISTS "rest_seconds" integer;
--> statement-breakpoint

-- ─── 4. template_exercises: add rir column ────────────────────────────────────
ALTER TABLE "template_exercises"
  ADD COLUMN IF NOT EXISTS "rir" integer;
--> statement-breakpoint

-- ─── 5. workout_sessions: add plan linkage columns ───────────────────────────
ALTER TABLE "workout_sessions"
  ADD COLUMN IF NOT EXISTS "plan_day_id" uuid,
  ADD COLUMN IF NOT EXISTS "week_index" integer,
  ADD COLUMN IF NOT EXISTS "day_index" integer;
--> statement-breakpoint

-- ─── 6. user_profiles: add injuries column ───────────────────────────────────
ALTER TABLE "user_profiles"
  ADD COLUMN IF NOT EXISTS "injuries" text;
--> statement-breakpoint

-- ─── 7. coach_conversations: add mode and status columns ─────────────────────
ALTER TABLE "coach_conversations"
  ADD COLUMN IF NOT EXISTS "mode" varchar(20),
  ADD COLUMN IF NOT EXISTS "status" varchar(20) NOT NULL DEFAULT 'active';
--> statement-breakpoint

-- ─── 8. New tables ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "cardio_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cardio_template_exercises" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "cardio_template_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "zone" integer,
  "kilometers" numeric,
  "order" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "status" varchar(50) NOT NULL DEFAULT 'draft',
  "microcycle_length" integer NOT NULL DEFAULT 7,
  "mesocycle_length" integer NOT NULL DEFAULT 4,
  "activated_at" timestamp with time zone,
  "start_date" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan_microcycles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "training_plan_id" uuid NOT NULL,
  "position" integer NOT NULL,
  "name" varchar(255),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan_days" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "plan_microcycle_id" uuid NOT NULL,
  "day_number" integer NOT NULL,
  "type" varchar(50) NOT NULL DEFAULT 'training',
  "workout_template_id" uuid,
  "cardio_template_id" uuid,
  "notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan_day_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "training_plan_id" uuid NOT NULL,
  "plan_day_id" uuid NOT NULL,
  "week_index" integer NOT NULL,
  "day_index" integer NOT NULL,
  "status" varchar(50) NOT NULL,
  "workout_session_id" uuid,
  "notes" text,
  "logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── 9. Foreign keys for new tables ──────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "cardio_templates" ADD CONSTRAINT "cardio_templates_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cardio_template_exercises" ADD CONSTRAINT "cardio_template_exercises_cardio_template_id_fk"
    FOREIGN KEY ("cardio_template_id") REFERENCES "public"."cardio_templates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "plan_microcycles" ADD CONSTRAINT "plan_microcycles_training_plan_id_fk"
    FOREIGN KEY ("training_plan_id") REFERENCES "public"."training_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "plan_days" ADD CONSTRAINT "plan_days_plan_microcycle_id_fk"
    FOREIGN KEY ("plan_microcycle_id") REFERENCES "public"."plan_microcycles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "plan_days" ADD CONSTRAINT "plan_days_workout_template_id_fk"
    FOREIGN KEY ("workout_template_id") REFERENCES "public"."workout_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "plan_days" ADD CONSTRAINT "plan_days_cardio_template_id_fk"
    FOREIGN KEY ("cardio_template_id") REFERENCES "public"."cardio_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "plan_day_logs" ADD CONSTRAINT "plan_day_logs_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "plan_day_logs" ADD CONSTRAINT "plan_day_logs_training_plan_id_fk"
    FOREIGN KEY ("training_plan_id") REFERENCES "public"."training_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "plan_day_logs" ADD CONSTRAINT "plan_day_logs_plan_day_id_fk"
    FOREIGN KEY ("plan_day_id") REFERENCES "public"."plan_days"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "plan_day_logs" ADD CONSTRAINT "plan_day_logs_workout_session_id_fk"
    FOREIGN KEY ("workout_session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
