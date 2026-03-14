-- ─── Task 2: One active plan per user — unique partial index ─────────────────
-- Ensures at most one non-completed training plan exists per user at the DB level.
-- Uses a partial unique index so 'completed' plans are excluded (users can have
-- multiple completed plans in history).

CREATE UNIQUE INDEX IF NOT EXISTS "training_plans_user_id_active_unique"
  ON "training_plans" ("user_id")
  WHERE "status" != 'completed';
