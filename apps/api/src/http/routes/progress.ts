import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { personalRecords, workoutSessions, exercises } from "@fitforge/db";
import { getDb } from "../../infrastructure/db.js";
import { authMiddleware, getUserId } from "../middleware/auth.js";

export const progressRoutes = new Hono()
  .use("*", authMiddleware)

  .get("/records", async (c) => {
    const userId = getUserId(c);
    const db = getDb();

    const records = await db.query.personalRecords.findMany({
      where: eq(personalRecords.userId, userId),
      with: { exercise: true },
      orderBy: [desc(personalRecords.achievedAt)],
    });

    return c.json(records);
  })

  .get("/stats", async (c) => {
    const userId = getUserId(c);
    const db = getDb();

    // Sessions this week (last 7 days)
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const recentSessions = await db.query.workoutSessions.findMany({
      where: and(
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.status, "completed")
      ),
      orderBy: [desc(workoutSessions.completedAt)],
      limit: 50,
    });

    const thisWeekSessions = recentSessions.filter(
      (s) => s.completedAt && new Date(s.completedAt) >= weekAgo
    );

    // Compute streak (consecutive days with a session)
    const sessionDates = [
      ...new Set(
        recentSessions
          .filter((s) => s.completedAt)
          .map((s) => s.completedAt!.toString().split("T")[0])
      ),
    ].sort((a, b) => b.localeCompare(a));

    let streak = 0;
    const today = now.toISOString().split("T")[0];
    const yesterday = new Date(now.getTime() - 86400000)
      .toISOString()
      .split("T")[0];

    if (sessionDates.length > 0) {
      const startDate =
        sessionDates[0] === today || sessionDates[0] === yesterday
          ? sessionDates[0]
          : null;

      if (startDate) {
        streak = 1;
        let prev = new Date(startDate);
        for (let i = 1; i < sessionDates.length; i++) {
          const cur = new Date(sessionDates[i]);
          const diff =
            (prev.getTime() - cur.getTime()) / (1000 * 60 * 60 * 24);
          if (diff === 1) {
            streak++;
            prev = cur;
          } else {
            break;
          }
        }
      }
    }

    return c.json({
      weeklySessionCount: thisWeekSessions.length,
      totalSessions: recentSessions.length,
      currentStreak: streak,
      lastSession: recentSessions[0] ?? null,
    });
  });
