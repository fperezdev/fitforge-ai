import { Hono } from "hono";
import { eq, and, desc, gte, inArray } from "drizzle-orm";
import {
  personalRecords,
  workoutSessions,
  cardioSessions,
  planDayLogs,
  trainingPlans,
  planMicrocycles,
  planDays,
} from "@fitforge/db";
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

    const now = new Date();

    // Active plan: derive current microcycle start, planned sessions, skipped count
    const activePlan = await db.query.trainingPlans.findFirst({
      where: and(eq(trainingPlans.userId, userId), eq(trainingPlans.status, "active")),
      columns: { id: true, startDate: true, activatedAt: true, microcycleLength: true },
    });

    // Current microcycle start — anchored to plan start date, respects any microcycle length
    let currentMcStart: Date | null = null;
    if (activePlan) {
      const anchorStr = activePlan.startDate ?? activePlan.activatedAt?.toISOString().slice(0, 10);
      if (anchorStr) {
        const anchor = new Date(anchorStr + "T00:00:00Z");
        const todayUtc = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
        const daysSinceAnchor = Math.floor((todayUtc.getTime() - anchor.getTime()) / 86_400_000);
        const currentWeekIndex = Math.floor(daysSinceAnchor / activePlan.microcycleLength);
        currentMcStart = new Date(
          anchor.getTime() + currentWeekIndex * activePlan.microcycleLength * 86_400_000,
        );
      }
    }

    // Strength sessions in the current microcycle
    const strengthSessions = currentMcStart
      ? await db.query.workoutSessions.findMany({
          where: and(
            eq(workoutSessions.userId, userId),
            eq(workoutSessions.status, "completed"),
            gte(workoutSessions.completedAt, currentMcStart),
          ),
          columns: { id: true },
          limit: 50,
        })
      : [];

    // Cardio sessions in the current microcycle
    const cardioThisWeek = currentMcStart
      ? await db.query.cardioSessions.findMany({
          where: and(
            eq(cardioSessions.userId, userId),
            eq(cardioSessions.status, "completed"),
            gte(cardioSessions.completedAt, currentMcStart),
          ),
          columns: { id: true },
          limit: 50,
        })
      : [];

    let plannedStrengthPerWeek = 0;
    let plannedCardioPerWeek = 0;

    if (activePlan) {
      const firstMc = await db.query.planMicrocycles.findFirst({
        where: eq(planMicrocycles.trainingPlanId, activePlan.id),
        columns: { id: true },
        orderBy: (mc, { asc }) => [asc(mc.position)],
      });

      if (firstMc) {
        const days = await db.query.planDays.findMany({
          where: eq(planDays.planMicrocycleId, firstMc.id),
          columns: { type: true, workoutTemplateId: true, cardioTemplateId: true },
        });
        plannedStrengthPerWeek = days.filter(
          (d) => d.type === "training" && d.workoutTemplateId,
        ).length;
        plannedCardioPerWeek = days.filter(
          (d) => d.type === "training" && d.cardioTemplateId,
        ).length;
      }
    }

    const skippedLogs = activePlan
      ? await db.query.planDayLogs.findMany({
          where: and(
            eq(planDayLogs.trainingPlanId, activePlan.id),
            eq(planDayLogs.userId, userId),
            inArray(planDayLogs.status, ["skipped", "workout_skipped", "cardio_skipped"]),
          ),
          columns: { id: true },
        })
      : [];

    // Compute streak from strength sessions (last 50 completed, all-time)
    const recentStrength = await db.query.workoutSessions.findMany({
      where: and(eq(workoutSessions.userId, userId), eq(workoutSessions.status, "completed")),
      orderBy: [desc(workoutSessions.completedAt)],
      columns: { completedAt: true },
      limit: 50,
    });

    const sessionDates = [
      ...new Set(
        recentStrength
          .filter((s) => s.completedAt)
          .map((s) => s.completedAt!.toISOString().split("T")[0]),
      ),
    ].sort((a, b) => b.localeCompare(a));

    let streak = 0;
    const today = now.toISOString().split("T")[0];
    const yesterday = new Date(now.getTime() - 86400000).toISOString().split("T")[0];

    if (sessionDates.length > 0) {
      const startDate =
        sessionDates[0] === today || sessionDates[0] === yesterday ? sessionDates[0] : null;

      if (startDate) {
        streak = 1;
        let prev = new Date(startDate);
        for (let i = 1; i < sessionDates.length; i++) {
          const cur = new Date(sessionDates[i]);
          const diff = (prev.getTime() - cur.getTime()) / (1000 * 60 * 60 * 24);
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
      weeklyStrengthCount: strengthSessions.length,
      weeklyCardioCount: cardioThisWeek.length,
      plannedStrengthPerWeek,
      plannedCardioPerWeek,
      skippedCount: skippedLogs.length,
      currentStreak: streak,
    });
  });
