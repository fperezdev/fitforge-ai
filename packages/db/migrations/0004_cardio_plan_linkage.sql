-- ─── Task 3: Align cardio_sessions plan linkage with workout_sessions ─────────
-- workout_sessions already has plan_day_id / week_index / day_index.
-- Adding the same columns to cardio_sessions so cardio can be stored with its
-- plan slot directly on the row (consistent querying, no join through plan_day_logs).

ALTER TABLE "cardio_sessions"
  ADD COLUMN IF NOT EXISTS "plan_day_id" uuid,
  ADD COLUMN IF NOT EXISTS "week_index" integer,
  ADD COLUMN IF NOT EXISTS "day_index" integer;
