import { eq, desc, and } from "drizzle-orm";
import { getDb } from "./db.js";
import {
  userProfiles,
  workoutSessions,
  exerciseEntries,
  exerciseSets,
  exercises,
  cardioSessions,
  personalRecords,
  weightEntries,
  coachMessages,
  coachConversations,
} from "@fitforge/db";
import type { CoachContext } from "../domain/types.js";

export async function buildCoachContext(
  userId: string,
  conversationId: string
): Promise<CoachContext> {
  const db = getDb();

  const [conversation, profile, sessions, cardio, prs, weights, history, allExercises] =
    await Promise.all([
      // Conversation (for mode)
      db.query.coachConversations.findFirst({
        where: eq(coachConversations.id, conversationId),
      }),

      // Profile
      db.query.userProfiles.findFirst({
        where: eq(userProfiles.userId, userId),
      }),

      // Last 7 workout sessions with exercises + sets
      db.query.workoutSessions.findMany({
        where: and(
          eq(workoutSessions.userId, userId),
          eq(workoutSessions.status, "completed")
        ),
        orderBy: [desc(workoutSessions.completedAt)],
        limit: 7,
        with: {
          exerciseEntries: {
            with: {
              exercise: true,
              sets: true,
            },
          },
        },
      }),

      // Last 5 cardio sessions
      db.query.cardioSessions.findMany({
        where: and(
          eq(cardioSessions.userId, userId),
          eq(cardioSessions.status, "completed")
        ),
        orderBy: [desc(cardioSessions.completedAt)],
        limit: 5,
      }),

      // Top 10 PRs (estimated 1RM)
      db.query.personalRecords.findMany({
        where: and(
          eq(personalRecords.userId, userId),
          eq(personalRecords.type, "estimated_1rm")
        ),
        orderBy: [desc(personalRecords.value)],
        limit: 10,
        with: { exercise: true },
      }),

      // Last 30 weight entries
      db.query.weightEntries.findMany({
        where: eq(weightEntries.userId, userId),
        orderBy: [desc(weightEntries.date)],
        limit: 30,
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
          unitPreference: (profile.unitPreference ?? "metric") as
            | "metric"
            | "imperial",
          injuries: profile.injuries ?? null,
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
    conversationHistory: history.reverse().map((m) => ({
      ...m,
      role: m.role as "user" | "assistant",
      createdAt: m.createdAt.toISOString(),
    })),
    exercises: allExercises,
  };
}
