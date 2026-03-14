-- Drop unused tables
DROP TABLE IF EXISTS "progress_photos";
DROP TABLE IF EXISTS "cardio_route_points";

-- Drop unused columns from coach_requests
ALTER TABLE "coach_requests" DROP COLUMN IF EXISTS "tokens_generated";
ALTER TABLE "coach_requests" DROP COLUMN IF EXISTS "context_snapshot";
ALTER TABLE "coach_requests" DROP COLUMN IF EXISTS "retry_count";

-- Drop unused FK column from cardio_sessions
ALTER TABLE "cardio_sessions" DROP COLUMN IF EXISTS "cardio_template_id";

-- Drop body_goals (feature removed)
DROP TABLE IF EXISTS "body_goals";
