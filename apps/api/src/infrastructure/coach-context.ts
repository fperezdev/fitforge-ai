import { eq, desc, and, gte, ne } from "drizzle-orm";
import { getDb } from "./db.js";
import {
  userProfiles,
  workoutSessions,
  cardioSessions,
  personalRecords,
  weightEntries,
  bodyMeasurements,
  trainingPlans,
  coachMessages,
  coachConversations,
} from "@fitforge/db";
import type { CoachContext, EquipmentOption } from "../domain/types.js";

const YEAR_AGO = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d;
};

export async function buildCoachContext(
  userId: string,
  conversationId: string,
): Promise<CoachContext> {
  const db = getDb();
  const yearAgo = YEAR_AGO();

  const [
    conversation,
    profile,
    sessions,
    cardio,
    prs,
    weights,
    measurements,
    currentPlan,
    history,
    allExercises,
  ] = await Promise.all([
    // Conversation (for mode)
    db.query.coachConversations.findFirst({
      where: eq(coachConversations.id, conversationId),
    }),

    // Profile
    db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
    }),

    // All workout sessions in the last 365 days with exercises + sets
    db.query.workoutSessions.findMany({
      where: and(
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.status, "completed"),
        gte(workoutSessions.completedAt, yearAgo),
      ),
      orderBy: [desc(workoutSessions.completedAt)],
      with: {
        exerciseEntries: {
          with: {
            exercise: true,
            sets: true,
          },
        },
      },
    }),

    // All cardio sessions in the last 365 days
    db.query.cardioSessions.findMany({
      where: and(
        eq(cardioSessions.userId, userId),
        eq(cardioSessions.status, "completed"),
        gte(cardioSessions.completedAt, yearAgo),
      ),
      orderBy: [desc(cardioSessions.completedAt)],
    }),

    // All PRs (all types: estimated_1rm, max_weight, max_reps)
    db.query.personalRecords.findMany({
      where: eq(personalRecords.userId, userId),
      orderBy: [desc(personalRecords.achievedAt)],
      with: { exercise: true },
    }),

    // All weight entries in the last 365 days
    db.query.weightEntries.findMany({
      where: and(
        eq(weightEntries.userId, userId),
        gte(weightEntries.date, yearAgo.toISOString().split("T")[0]),
      ),
      orderBy: [desc(weightEntries.date)],
    }),

    // All body measurements in the last 365 days
    db.query.bodyMeasurements.findMany({
      where: and(
        eq(bodyMeasurements.userId, userId),
        gte(bodyMeasurements.date, yearAgo.toISOString().split("T")[0]),
      ),
      orderBy: [desc(bodyMeasurements.date)],
    }),

    // Current training plan (non-completed)
    db.query.trainingPlans.findFirst({
      where: and(eq(trainingPlans.userId, userId), ne(trainingPlans.status, "completed")),
    }),

    // Conversation history
    db.query.coachMessages.findMany({
      where: eq(coachMessages.conversationId, conversationId),
      orderBy: [desc(coachMessages.createdAt)],
      limit: 20,
    }),

    // All exercises (for AI prompt reference)
    db.query.exercises.findMany({
      orderBy: (ex, { asc }) => [asc(ex.name)],
    }),
  ]);

  return {
    conversationMode: (conversation?.mode ?? null) as "advice" | "plan" | null,
    profile: profile
      ? {
          ...profile,
          unitPreference: (profile.unitPreference ?? "metric") as "metric" | "imperial",
          injuries: profile.injuries ?? null,
          equipment: (profile.equipment ?? ["full_gym"]) as EquipmentOption[],
          createdAt: profile.createdAt.toISOString(),
          updatedAt: profile.updatedAt.toISOString(),
        }
      : null,
    recentSessions: sessions.map((s) => ({
      ...s,
      startedAt: s.startedAt.toISOString(),
      completedAt: s.completedAt?.toISOString() ?? null,
      status: s.status as "in_progress" | "completed" | "cancelled",
      entries: s.exerciseEntries?.map((e) => ({
        ...e,
        sets: e.sets.map((set) => ({
          ...set,
          type: set.type as "warmup" | "working" | "dropset" | "failure",
        })),
      })),
    })),
    recentCardio: cardio.map((c) => ({
      ...c,
      startedAt: c.startedAt.toISOString(),
      completedAt: c.completedAt?.toISOString() ?? null,
      status: c.status as "in_progress" | "completed" | "cancelled",
    })),
    personalRecords: prs.map((pr) => ({
      ...pr,
      achievedAt: pr.achievedAt.toISOString(),
      type: pr.type as "max_weight" | "max_reps" | "estimated_1rm",
      exercise: pr.exercise,
    })),
    weightTrend: weights.slice().reverse(),
    bodyMeasurements: measurements
      .slice()
      .reverse()
      .map((m) => ({
        ...m,
        date: typeof m.date === "string" ? m.date : (m.date as Date).toISOString().split("T")[0],
      })),
    currentPlan: currentPlan
      ? {
          ...currentPlan,
          activatedAt: currentPlan.activatedAt?.toISOString() ?? null,
          startDate: currentPlan.startDate ?? null,
          createdAt: currentPlan.createdAt.toISOString(),
          updatedAt: currentPlan.updatedAt.toISOString(),
        }
      : null,
    conversationHistory: history.reverse().map((m) => ({
      ...m,
      role: m.role as "user" | "assistant",
      createdAt: m.createdAt.toISOString(),
    })),
    exercises: allExercises,
  };
}
