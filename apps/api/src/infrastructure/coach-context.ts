import { eq, desc, and, sql } from "drizzle-orm";
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
  bodyGoals,
  coachMessages,
} from "@fitforge/db";
import type { CoachContext } from "../domain/types.js";

export async function buildCoachContext(
  userId: string,
  conversationId: string
): Promise<CoachContext> {
  const db = getDb();

  const [profile, sessions, cardio, prs, weights, goals, history] =
    await Promise.all([
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

      // Active goals
      db.query.bodyGoals.findMany({
        where: and(
          eq(bodyGoals.userId, userId),
          eq(bodyGoals.status, "active")
        ),
      }),

      // Conversation history
      db.query.coachMessages.findMany({
        where: eq(coachMessages.conversationId, conversationId),
        orderBy: [desc(coachMessages.createdAt)],
        limit: 20,
      }),
    ]);

  return {
    profile: profile
      ? {
          ...profile,
          heightCm: profile.heightCm ? Number(profile.heightCm) : null,
          unitPreference: (profile.unitPreference ?? "metric") as
            | "metric"
            | "imperial",
        }
      : null,
    recentSessions: sessions.map((s: any) => ({
      ...s,
      entries: s.exerciseEntries?.map((e: any) => ({
        ...e,
        sets: e.sets?.map((set: any) => ({
          ...set,
          weightKg: set.weightKg ? Number(set.weightKg) : null,
          rpe: set.rpe ? Number(set.rpe) : null,
        })),
      })),
    })),
    recentCardio: cardio as any[],
    personalRecords: prs.map((pr: any) => ({
      ...pr,
      value: Number(pr.value),
      previousValue: pr.previousValue ? Number(pr.previousValue) : null,
    })),
    weightTrend: weights
      .map((w: any) => ({
        ...w,
        weightKg: Number(w.weightKg),
      }))
      .reverse(),
    activeGoals: goals.map((g: any) => ({
      ...g,
      targetValue: Number(g.targetValue),
      currentValue: Number(g.currentValue),
      status: g.status as "active" | "completed" | "cancelled",
    })),
    conversationHistory: history.reverse().map((m: any) => ({
      ...m,
      role: m.role as "user" | "assistant",
    })),
  };
}
