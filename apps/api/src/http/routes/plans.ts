import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, ne, inArray, gt, sql } from "drizzle-orm";
import {
  trainingPlans,
  planMicrocycles,
  planDays,
  workoutTemplates,
  templateExercises,
  exercises,
  cardioTemplates,
  cardioTemplateExercises,
  planDayLogs,
  exerciseEntries,
  workoutSessions,
  coachConversations,
} from "@fitforge/db";
import { getDb } from "../../infrastructure/db.js";
import { authMiddleware, getUserId } from "../middleware/auth.js";
import type { Muscle } from "@fitforge/types";

// ─── AI import schema ─────────────────────────────────────────────────────────

const MUSCLES = [
  "chest",
  "back",
  "lats",
  "traps",
  "anterior_deltoids",
  "lateral_deltoids",
  "posterior_deltoids",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "obliques",
  "glutes",
  "quadriceps",
  "hamstrings",
  "calves",
  "soleus",
  "hip_flexors",
  "adductors",
  "full_body",
  "other",
] as const;

const muscleSchema = z.enum(MUSCLES);

const aiStrengthExerciseSchema = z.object({
  name: z.string(),
  primaryMuscle: muscleSchema.catch("other"),
  secondaryMuscles: z.array(muscleSchema.catch("other")).default([]),
  sets: z.number().int(),
  repMin: z.number().int().optional(),
  repMax: z.number().int().optional(),
  restSeconds: z.number().int().optional(),
  rir: z.number().int().optional(),
});

const aiCardioExerciseSchema = z.object({
  name: z.string(),
  zone: z.number().int().optional(),
  kilometers: z.number().optional(),
});

const aiDaySchema = z.object({
  day: z.number().int(),
  rest: z.boolean().optional(),
  restNote: z.string().optional().nullable(),
  workout: z
    .object({
      name: z.string(),
      exercises: z.array(aiStrengthExerciseSchema),
    })
    .optional()
    .nullable(),
  cardio: z
    .object({
      name: z.string(),
      exercises: z.array(aiCardioExerciseSchema),
    })
    .optional()
    .nullable(),
});

const aiWeekSchema = z.object({
  week: z.number().int(),
  days: z.array(aiDaySchema),
});

const fromAiSchema = z.object({
  name: z.string().min(1).max(255).default("AI Training Plan"),
  description: z.string().optional().nullable(),
  weeks: z.array(aiWeekSchema).min(1),
});

const createPlanSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  microcycleLength: z.number().int().min(1).max(31).default(7),
  mesocycleLength: z.number().int().min(1).max(52).default(4),
});

const updatePlanSchema = createPlanSchema
  .extend({
    status: z.enum(["draft", "active", "completed"]).optional(),
    startDate: z.string().date().optional(), // YYYY-MM-DD, only used when activating
  })
  .partial();

const upsertDaySchema = z.object({
  type: z.enum(["training", "rest"]).default("training"),
  workoutTemplateId: z.string().uuid().nullable().optional(),
  cardioTemplateId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ─── Helper: resolve all exercise names to IDs in two queries max ─────────────

type ExerciseInput = {
  name: string;
  primaryMuscle?: string;
  secondaryMuscles?: string[];
};

async function resolveExercises(
  db: ReturnType<typeof getDb>,
  exInputs: ExerciseInput[],
): Promise<Map<string, string>> {
  // Map from lowercase name → id
  const result = new Map<string, string>();
  if (exInputs.length === 0) return result;

  const uniqueNames = [...new Set(exInputs.map((e) => e.name.toLowerCase()))];

  // 1. Fetch all existing exercises in one query
  const existing = await db
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .where(inArray(sql`lower(${exercises.name})`, uniqueNames));

  for (const row of existing) result.set(row.name.toLowerCase(), row.id);

  // 2. Insert missing exercises in one batch
  const missing = exInputs.filter((e) => !result.has(e.name.toLowerCase()));
  if (missing.length > 0) {
    // Deduplicate by lowercase name — keep first occurrence's muscle data
    const seen = new Set<string>();
    const toInsert = missing.filter((e) => {
      const key = e.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const inserted = await db
      .insert(exercises)
      .values(
        toInsert.map((e) => ({
          name: e.name,
          primaryMuscle: (e.primaryMuscle ?? "other") as Muscle,
          secondaryMuscles: (e.secondaryMuscles ?? []) as Muscle[],
        })),
      )
      .onConflictDoNothing()
      .returning({ id: exercises.id, name: exercises.name });

    for (const row of inserted) result.set(row.name.toLowerCase(), row.id);
  }

  return result;
}

// ─── Plan helper utilities ─────────────────────────────────────────────────────

/** Resolve a (0-based weekIndex, 0-based dayIndex) pair to the matching plan day row. */
function resolvePlanDay<D extends { dayNumber: number }>(
  microcycles: Array<{ position: number; days: D[] }>,
  weekIndex: number,
  dayIndex: number,
): D | undefined {
  const week = microcycles.find((mc) => mc.position === weekIndex + 1);
  return week?.days.find((d) => d.dayNumber === dayIndex + 1);
}

/** Compute the UTC anchor date for a plan (startDate takes priority over activatedAt). */
function getPlanAnchor(plan: { startDate: string | null; activatedAt: Date | null }): Date | null {
  if (plan.startDate) return new Date(plan.startDate + "T00:00:00Z");
  if (plan.activatedAt) return new Date(plan.activatedAt);
  return null;
}

/** Deep-clone a day's workout and cardio templates; returns new template IDs. */
async function cloneTemplatesForDay(
  db: ReturnType<typeof getDb>,
  userId: string,
  day: {
    workoutTemplate: {
      name: string;
      templateExercises: {
        exerciseId: string;
        order: number;
        targetSets: number;
        targetRepMin: number;
        targetRepMax: number;
        rir: number | null;
        restSeconds: number | null;
      }[];
    } | null;
    cardioTemplate: {
      name: string;
      cardioTemplateExercises: {
        name: string;
        zone: number | null;
        kilometers: number | null;
        order: number;
      }[];
    } | null;
  },
): Promise<{ workoutTemplateId: string | null; cardioTemplateId: string | null }> {
  const [newWorkoutTemplateId, newCardioTemplateId] = await Promise.all([
    (async () => {
      if (!day.workoutTemplate) return null;
      const [tmpl] = await db
        .insert(workoutTemplates)
        .values({ userId, name: day.workoutTemplate.name })
        .returning();
      if (day.workoutTemplate.templateExercises.length > 0) {
        await db.insert(templateExercises).values(
          day.workoutTemplate.templateExercises.map((te) => ({
            workoutTemplateId: tmpl.id,
            exerciseId: te.exerciseId,
            order: te.order,
            targetSets: te.targetSets,
            targetRepMin: te.targetRepMin,
            targetRepMax: te.targetRepMax,
            rir: te.rir,
            restSeconds: te.restSeconds,
          })),
        );
      }
      return tmpl.id;
    })(),
    (async () => {
      if (!day.cardioTemplate) return null;
      const [tmpl] = await db
        .insert(cardioTemplates)
        .values({ userId, name: day.cardioTemplate.name })
        .returning();
      if (day.cardioTemplate.cardioTemplateExercises.length > 0) {
        await db.insert(cardioTemplateExercises).values(
          day.cardioTemplate.cardioTemplateExercises.map((ce) => ({
            cardioTemplateId: tmpl.id,
            name: ce.name,
            zone: ce.zone,
            kilometers: ce.kilometers,
            order: ce.order,
          })),
        );
      }
      return tmpl.id;
    })(),
  ]);
  return { workoutTemplateId: newWorkoutTemplateId, cardioTemplateId: newCardioTemplateId };
}

/** Add a blank microcycle at the next position and return it (shared by add-week and clone-week). */
async function addMicrocycle(
  db: ReturnType<typeof getDb>,
  planId: string,
  microcycleLength: number,
  currentMicrocycles: { position: number }[],
  name?: string | null,
) {
  const nextPosition =
    (currentMicrocycles.length > 0 ? Math.max(...currentMicrocycles.map((m) => m.position)) : 0) +
    1;
  const [mc] = await db
    .insert(planMicrocycles)
    .values({ trainingPlanId: planId, position: nextPosition, name: name ?? null })
    .returning();
  const dayRows = Array.from({ length: microcycleLength }, (_, i) => ({
    planMicrocycleId: mc.id,
    dayNumber: i + 1,
    type: "training" as const,
  }));
  if (dayRows.length > 0) await db.insert(planDays).values(dayRows);
  await db
    .update(trainingPlans)
    .set({ mesocycleLength: nextPosition, updatedAt: new Date() })
    .where(eq(trainingPlans.id, planId));
  return mc;
}

/** Extend every microcycle by one empty day and return the new day number (shared by extend and clone-day). */
async function extendDays(
  db: ReturnType<typeof getDb>,
  planId: string,
  microcycles: { id: string }[],
  currentLength: number,
) {
  const newDayNumber = currentLength + 1;
  await db.insert(planDays).values(
    microcycles.map((mc) => ({
      planMicrocycleId: mc.id,
      dayNumber: newDayNumber,
      type: "training" as const,
    })),
  );
  await db
    .update(trainingPlans)
    .set({ microcycleLength: newDayNumber, updatedAt: new Date() })
    .where(eq(trainingPlans.id, planId));
  return newDayNumber;
}

export const planRoutes = new Hono()
  .use("*", authMiddleware)

  // List all plans for user
  .get("/", async (c) => {
    const userId = getUserId(c);
    const db = getDb();
    const plan = await db.query.trainingPlans.findFirst({
      where: eq(trainingPlans.userId, userId),
    });
    return c.json(plan ?? null);
  })

  // Get active plan with suggested workout day
  .get("/active", async (c) => {
    const userId = getUserId(c);
    const db = getDb();

    const plan = await db.query.trainingPlans.findFirst({
      where: and(eq(trainingPlans.userId, userId), eq(trainingPlans.status, "active")),
      with: {
        microcycles: {
          orderBy: (pm, { asc }) => [asc(pm.position)],
          with: {
            days: {
              orderBy: (pd, { asc }) => [asc(pd.dayNumber)],
              with: {
                workoutTemplate: { columns: { id: true, name: true } },
                cardioTemplate: { columns: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!plan) return c.json(null);

    // Compute suggested day based on calendar position since activation,
    // advancing past any already-skipped days (up to one full cycle look-ahead)
    let suggestedDay: {
      planDayId: string;
      weekIndex: number;
      dayIndex: number;
      scheduledDate: string; // YYYY-MM-DD — the fixed calendar date for this plan slot
      type: string;
      workoutTemplate: { id: string; name: string } | null;
      cardioTemplate: { id: string; name: string } | null;
    } | null = null;

    // Logs grouped by day key: "weekIndex:dayIndex" → status[]
    const logsByDay = new Map<string, string[]>();

    if (plan.activatedAt) {
      const msPerDay = 86_400_000;
      // Use startDate (user-chosen Day 1) when available; fall back to activatedAt for legacy rows
      const anchor = getPlanAnchor(plan)!;
      const daysSince = Math.floor((Date.now() - anchor.getTime()) / msPerDay);
      const totalDays = plan.microcycleLength * plan.mesocycleLength;

      // Fetch all resolved logs for this plan (skipped or completed, per-component or full)
      const resolvedLogs = await db
        .select({
          weekIndex: planDayLogs.weekIndex,
          dayIndex: planDayLogs.dayIndex,
          status: planDayLogs.status,
        })
        .from(planDayLogs)
        .where(eq(planDayLogs.trainingPlanId, plan.id));

      // Group logs by day key so we can check per-component resolution
      for (const l of resolvedLogs) {
        const key = `${l.weekIndex}:${l.dayIndex}`;
        const arr = logsByDay.get(key) ?? [];
        arr.push(l.status);
        logsByDay.set(key, arr);
      }

      // A day slot is "fully done" (should be skipped in suggestion) when:
      //   - it has a 'skipped' or 'completed' full-day log, OR
      //   - both its workout and cardio components are resolved
      function isDayFullyResolved(key: string, hasWorkout: boolean, hasCardio: boolean): boolean {
        const statuses = logsByDay.get(key) ?? [];
        if (statuses.includes("skipped") || statuses.includes("completed")) return true;
        const workoutDone =
          !hasWorkout ||
          statuses.includes("workout_completed") ||
          statuses.includes("workout_skipped");
        const cardioDone =
          !hasCardio ||
          statuses.includes("cardio_completed") ||
          statuses.includes("cardio_skipped");
        return workoutDone && cardioDone;
      }

      // Walk forward from today's calendar position until we find a non-resolved day
      let offset = 0;
      while (offset < totalDays) {
        const pos = daysSince + offset;
        const weekIndex = Math.floor(pos / plan.microcycleLength) % plan.mesocycleLength;
        const dayIndex = pos % plan.microcycleLength;
        const key = `${weekIndex}:${dayIndex}`;

        const day = resolvePlanDay(plan.microcycles, weekIndex, dayIndex);

        if (!day) {
          offset++;
          continue;
        }

        const hasWorkout = !!day.workoutTemplateId;
        const hasCardio = !!day.cardioTemplateId;

        if (!isDayFullyResolved(key, hasWorkout, hasCardio)) {
          // Compute the fixed calendar date for this slot (anchor + pos days, UTC)
          const slotDate = new Date(anchor.getTime() + pos * msPerDay);
          const scheduledDate = slotDate.toISOString().slice(0, 10);

          // For suggestion, only expose components not yet resolved
          const statuses = logsByDay.get(key) ?? [];
          const workoutResolved =
            statuses.includes("workout_completed") || statuses.includes("workout_skipped");
          const cardioResolved =
            statuses.includes("cardio_completed") || statuses.includes("cardio_skipped");

          suggestedDay = {
            planDayId: day.id,
            weekIndex,
            dayIndex,
            scheduledDate,
            type: day.type,
            workoutTemplate:
              !hasWorkout || workoutResolved
                ? null
                : (day.workoutTemplate as { id: string; name: string } | null),
            cardioTemplate:
              !hasCardio || cardioResolved
                ? null
                : (day.cardioTemplate as { id: string; name: string } | null),
          };
          break;
        }
        offset++;
      }
    }

    // Expose the per-slot status arrays so the frontend can replicate the walk
    const dayLogsOut: Record<string, string[]> = {};
    for (const [key, statuses] of logsByDay) {
      dayLogsOut[key] = statuses;
    }

    return c.json({ ...plan, suggestedDay, dayLogs: dayLogsOut });
  })

  // Skip today's suggested plan day (or a specific component of it)
  .post(
    "/active/skip-day",
    zValidator(
      "json",
      z.object({
        weekIndex: z.number().int().min(0),
        dayIndex: z.number().int().min(0),
        // 'workout' | 'cardio' | 'all' — defaults to 'all' for backward compat
        component: z.enum(["workout", "cardio", "all"]).default("all"),
        notes: z.string().optional().nullable(),
      }),
    ),
    async (c) => {
      const userId = getUserId(c);
      const { weekIndex, dayIndex, component, notes } = c.req.valid("json");
      const db = getDb();

      const plan = await db.query.trainingPlans.findFirst({
        where: and(eq(trainingPlans.userId, userId), eq(trainingPlans.status, "active")),
        with: {
          microcycles: {
            orderBy: (pm, { asc }) => [asc(pm.position)],
            with: {
              days: {
                orderBy: (pd, { asc }) => [asc(pd.dayNumber)],
              },
            },
          },
        },
      });

      if (!plan) return c.json({ error: "No active plan" }, 404);

      const day = resolvePlanDay(plan.microcycles, weekIndex, dayIndex);
      if (!day) return c.json({ error: "Plan day not found" }, 404);

      // Determine which status(es) to write
      const statusToWrite =
        component === "workout"
          ? "workout_skipped"
          : component === "cardio"
            ? "cardio_skipped"
            : "skipped";

      await db
        .insert(planDayLogs)
        .values({
          userId,
          trainingPlanId: plan.id,
          planDayId: day.id,
          weekIndex,
          dayIndex,
          status: statusToWrite,
          notes: notes ?? null,
        })
        .onConflictDoNothing();

      return c.json({ ok: true });
    },
  )

  // Move today's suggested plan day to tomorrow by shifting startDate back 1 day
  .post(
    "/active/move-day",
    zValidator(
      "json",
      z.object({
        weekIndex: z.number().int().min(0),
        dayIndex: z.number().int().min(0),
      }),
    ),
    async (c) => {
      const userId = getUserId(c);
      const { weekIndex, dayIndex } = c.req.valid("json");
      const db = getDb();

      const plan = await db.query.trainingPlans.findFirst({
        where: and(eq(trainingPlans.userId, userId), eq(trainingPlans.status, "active")),
        with: {
          microcycles: {
            orderBy: (pm, { asc }) => [asc(pm.position)],
            with: { days: { orderBy: (pd, { asc }) => [asc(pd.dayNumber)] } },
          },
        },
      });

      if (!plan) return c.json({ error: "No active plan" }, 404);

      const day = resolvePlanDay(plan.microcycles, weekIndex, dayIndex);
      if (!day) return c.json({ error: "Plan day not found" }, 404);

      // Shift startDate back by 1 day so every future slot moves forward by 1
      const currentAnchor = getPlanAnchor(plan)!;
      const newAnchor = new Date(currentAnchor.getTime() - 86_400_000);
      const newStartDate = newAnchor.toISOString().slice(0, 10);

      await db
        .update(trainingPlans)
        .set({ startDate: newStartDate })
        .where(and(eq(trainingPlans.id, plan.id), eq(trainingPlans.userId, userId)));

      return c.json({ ok: true, newStartDate });
    },
  )

  // Complete the active plan: skip all unresolved sessions, cancel in-progress workouts,
  // and mark the plan as completed.
  .post("/active/complete", async (c) => {
    const userId = getUserId(c);
    const db = getDb();

    const plan = await db.query.trainingPlans.findFirst({
      where: and(eq(trainingPlans.userId, userId), eq(trainingPlans.status, "active")),
      with: {
        microcycles: {
          orderBy: (pm, { asc }) => [asc(pm.position)],
          with: { days: { orderBy: (pd, { asc }) => [asc(pd.dayNumber)] } },
        },
      },
    });

    if (!plan) return c.json({ error: "No active plan" }, 404);

    // Fetch existing logs to avoid double-inserting
    const existingLogs = await db
      .select({
        weekIndex: planDayLogs.weekIndex,
        dayIndex: planDayLogs.dayIndex,
        status: planDayLogs.status,
      })
      .from(planDayLogs)
      .where(eq(planDayLogs.trainingPlanId, plan.id));

    const logsByDay = new Map<string, string[]>();
    for (const l of existingLogs) {
      const key = `${l.weekIndex}:${l.dayIndex}`;
      const arr = logsByDay.get(key) ?? [];
      arr.push(l.status);
      logsByDay.set(key, arr);
    }

    // Collect skip inserts for every unresolved component across all weeks
    const skipInserts: {
      userId: string;
      trainingPlanId: string;
      planDayId: string;
      weekIndex: number;
      dayIndex: number;
      status: string;
    }[] = [];

    for (const mc of plan.microcycles) {
      const wi = mc.position - 1;
      for (const day of mc.days) {
        if (day.type !== "training") continue;
        const di = day.dayNumber - 1;
        const key = `${wi}:${di}`;
        const statuses = logsByDay.get(key) ?? [];
        const resolved = statuses.includes("skipped") || statuses.includes("completed");

        if (!resolved && day.workoutTemplateId) {
          const workoutResolved =
            statuses.includes("workout_completed") || statuses.includes("workout_skipped");
          if (!workoutResolved) {
            skipInserts.push({
              userId,
              trainingPlanId: plan.id,
              planDayId: day.id,
              weekIndex: wi,
              dayIndex: di,
              status: "workout_skipped",
            });
          }
        }

        if (!resolved && day.cardioTemplateId) {
          const cardioResolved =
            statuses.includes("cardio_completed") || statuses.includes("cardio_skipped");
          if (!cardioResolved) {
            skipInserts.push({
              userId,
              trainingPlanId: plan.id,
              planDayId: day.id,
              weekIndex: wi,
              dayIndex: di,
              status: "cardio_skipped",
            });
          }
        }
      }
    }

    if (skipInserts.length > 0) {
      await db.insert(planDayLogs).values(skipInserts).onConflictDoNothing();
    }

    // Cancel all in-progress workout sessions linked to this plan's days
    const planDayIds = plan.microcycles.flatMap((mc) => mc.days.map((d) => d.id));
    if (planDayIds.length > 0) {
      await db
        .update(workoutSessions)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(
          and(
            eq(workoutSessions.userId, userId),
            eq(workoutSessions.status, "in_progress"),
            inArray(workoutSessions.planDayId, planDayIds),
          ),
        );
    }

    // Mark the plan as completed
    const [completed] = await db
      .update(trainingPlans)
      .set({ status: "completed", updatedAt: new Date() })
      .where(and(eq(trainingPlans.id, plan.id), eq(trainingPlans.userId, userId)))
      .returning();

    return c.json(completed);
  })

  // Get adherence metrics for the active plan
  .get("/active/adherence", async (c) => {
    const userId = getUserId(c);
    const db = getDb();

    const plan = await db.query.trainingPlans.findFirst({
      where: and(eq(trainingPlans.userId, userId), eq(trainingPlans.status, "active")),
      with: {
        microcycles: {
          orderBy: (pm, { asc }) => [asc(pm.position)],
          with: { days: { orderBy: (pd, { asc }) => [asc(pd.dayNumber)] } },
        },
      },
    });

    if (!plan || !plan.activatedAt) return c.json(null);

    // Compute "today's" position in the plan
    const msPerDay = 86_400_000;
    const daysSince = Math.floor((Date.now() - new Date(plan.activatedAt).getTime()) / msPerDay);
    const currentWeekIndex = Math.floor(daysSince / plan.microcycleLength) % plan.mesocycleLength;
    const currentDayIndex = daysSince % plan.microcycleLength;

    // Fetch all logs for this plan
    const logs = await db.query.planDayLogs.findMany({
      where: and(eq(planDayLogs.trainingPlanId, plan.id), eq(planDayLogs.userId, userId)),
    });

    const logMap = new Map<string, string[]>();
    for (const l of logs) {
      const key = `${l.weekIndex}:${l.dayIndex}`;
      const arr = logMap.get(key) ?? [];
      arr.push(l.status);
      logMap.set(key, arr);
    }

    // Helper: is a day considered "completed" for adherence? Both components must be done.
    function isDayCompleted(key: string, hasWorkout: boolean, hasCardio: boolean): boolean {
      const statuses = logMap.get(key) ?? [];
      if (statuses.includes("completed")) return true;
      const workoutDone = !hasWorkout || statuses.includes("workout_completed");
      const cardioDone = !hasCardio || statuses.includes("cardio_completed");
      return workoutDone && cardioDone;
    }

    function isDaySkipped(key: string): boolean {
      const statuses = logMap.get(key) ?? [];
      return (
        statuses.includes("skipped") ||
        statuses.includes("workout_skipped") ||
        statuses.includes("cardio_skipped")
      );
    }

    // Training days only (carry workoutTemplateId + cardioTemplateId for component awareness)
    const trainingDaysByWeek = plan.microcycles.map((mc) => ({
      weekIndex: mc.position - 1,
      days: mc.days
        .filter((d) => d.type === "training")
        .map((d) => ({
          dayIndex: d.dayNumber - 1,
          hasWorkout: !!d.workoutTemplateId,
          hasCardio: !!d.cardioTemplateId,
        })),
    }));

    // Build per-week stats; only count days that are in the past (before today)
    let totalPlanned = 0;
    let totalCompleted = 0;
    let totalSkipped = 0;
    let totalPending = 0;

    const weeks = trainingDaysByWeek.map(({ weekIndex, days }) => {
      let planned = 0;
      let completed = 0;
      let skipped = 0;
      let pending = 0;

      for (const { dayIndex: di, hasWorkout, hasCardio } of days) {
        // Only count days that are strictly in the past
        const isPast =
          weekIndex < currentWeekIndex || (weekIndex === currentWeekIndex && di < currentDayIndex);

        if (!isPast) continue;

        planned++;
        const key = `${weekIndex}:${di}`;
        if (isDayCompleted(key, hasWorkout, hasCardio)) completed++;
        else if (isDaySkipped(key)) skipped++;
        else pending++;
      }

      return { weekIndex, planned, completed, skipped, pending };
    });

    for (const w of weeks) {
      totalPlanned += w.planned;
      totalCompleted += w.completed;
      totalSkipped += w.skipped;
      totalPending += w.pending;
    }

    const completionRate = totalPlanned > 0 ? totalCompleted / totalPlanned : 0;

    // Streak: consecutive completed training days going backwards from yesterday
    // Build a flat ordered list of all past training day occurrences
    type DayOccurrence = {
      weekIndex: number;
      dayIndex: number;
      hasWorkout: boolean;
      hasCardio: boolean;
    };
    const pastTrainingDays: DayOccurrence[] = [];

    for (const { weekIndex, days } of trainingDaysByWeek) {
      for (const { dayIndex: di, hasWorkout, hasCardio } of days) {
        const isPast =
          weekIndex < currentWeekIndex || (weekIndex === currentWeekIndex && di < currentDayIndex);
        if (isPast) pastTrainingDays.push({ weekIndex, dayIndex: di, hasWorkout, hasCardio });
      }
    }

    // Sort by (weekIndex, dayIndex) ascending
    pastTrainingDays.sort((a, b) =>
      a.weekIndex !== b.weekIndex ? a.weekIndex - b.weekIndex : a.dayIndex - b.dayIndex,
    );

    let currentStreak = 0;
    let longestStreak = 0;
    let runningStreak = 0;

    for (const { weekIndex, dayIndex, hasWorkout, hasCardio } of pastTrainingDays) {
      const key = `${weekIndex}:${dayIndex}`;
      if (isDayCompleted(key, hasWorkout, hasCardio)) {
        runningStreak++;
        if (runningStreak > longestStreak) longestStreak = runningStreak;
      } else {
        runningStreak = 0;
      }
    }
    currentStreak = runningStreak;

    // Total volume: sum sets/reps/weight from completed sessions linked to this plan
    const completedSessionIds = logs
      .filter(
        (l) => (l.status === "completed" || l.status === "workout_completed") && l.workoutSessionId,
      )
      .map((l) => l.workoutSessionId as string);

    let totalSets = 0;
    let totalReps = 0;
    let totalWeightKg = 0;

    if (completedSessionIds.length > 0) {
      for (const sessionId of completedSessionIds) {
        const entries = await db.query.exerciseEntries.findMany({
          where: eq(exerciseEntries.workoutSessionId, sessionId),
          with: { sets: true },
        });
        for (const entry of entries) {
          for (const s of entry.sets) {
            if (!s.completed) continue;
            totalSets++;
            totalReps += s.reps ?? 0;
            totalWeightKg += (s.reps ?? 0) * (s.weightKg ?? 0);
          }
        }
      }
    }

    // --- Strength sub-metrics ---
    const strengthWeeks = trainingDaysByWeek.map(({ weekIndex, days }) => {
      let planned = 0,
        completed = 0,
        skipped = 0,
        pending = 0;
      for (const { dayIndex: di, hasWorkout } of days) {
        if (!hasWorkout) continue;
        const isPast =
          weekIndex < currentWeekIndex || (weekIndex === currentWeekIndex && di < currentDayIndex);
        if (!isPast) continue;
        planned++;
        const key = `${weekIndex}:${di}`;
        const statuses = logMap.get(key) ?? [];
        if (statuses.includes("completed") || statuses.includes("workout_completed")) completed++;
        else if (statuses.includes("skipped") || statuses.includes("workout_skipped")) skipped++;
        else pending++;
      }
      return { weekIndex, planned, completed, skipped, pending };
    });
    const strengthTotals = strengthWeeks.reduce(
      (acc, w) => ({
        planned: acc.planned + w.planned,
        completed: acc.completed + w.completed,
        skipped: acc.skipped + w.skipped,
        pending: acc.pending + w.pending,
      }),
      { planned: 0, completed: 0, skipped: 0, pending: 0 },
    );

    // --- Cardio sub-metrics ---
    const cardioWeeks = trainingDaysByWeek.map(({ weekIndex, days }) => {
      let planned = 0,
        completed = 0,
        skipped = 0,
        pending = 0;
      for (const { dayIndex: di, hasCardio } of days) {
        if (!hasCardio) continue;
        const isPast =
          weekIndex < currentWeekIndex || (weekIndex === currentWeekIndex && di < currentDayIndex);
        if (!isPast) continue;
        planned++;
        const key = `${weekIndex}:${di}`;
        const statuses = logMap.get(key) ?? [];
        if (statuses.includes("completed") || statuses.includes("cardio_completed")) completed++;
        else if (statuses.includes("skipped") || statuses.includes("cardio_skipped")) skipped++;
        else pending++;
      }
      return { weekIndex, planned, completed, skipped, pending };
    });
    const cardioTotals = cardioWeeks.reduce(
      (acc, w) => ({
        planned: acc.planned + w.planned,
        completed: acc.completed + w.completed,
        skipped: acc.skipped + w.skipped,
        pending: acc.pending + w.pending,
      }),
      { planned: 0, completed: 0, skipped: 0, pending: 0 },
    );

    return c.json({
      completionRate: Math.round(completionRate * 100) / 100,
      totalPlanned,
      totalCompleted,
      totalSkipped,
      totalPending,
      currentStreak,
      longestStreak,
      totalVolume: {
        sets: totalSets,
        reps: totalReps,
        weightKg: Math.round(totalWeightKg),
      },
      weeks,
      strength: { ...strengthTotals, weeks: strengthWeeks.filter((w) => w.planned > 0) },
      cardio: { ...cardioTotals, weeks: cardioWeeks.filter((w) => w.planned > 0) },
    });
  })

  // Get adherence metrics for a specific plan by ID
  .get("/:id/adherence", async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.param();
    const db = getDb();

    const plan = await db.query.trainingPlans.findFirst({
      where: and(eq(trainingPlans.id, id), eq(trainingPlans.userId, userId)),
      with: {
        microcycles: {
          orderBy: (pm, { asc }) => [asc(pm.position)],
          with: { days: { orderBy: (pd, { asc }) => [asc(pd.dayNumber)] } },
        },
      },
    });

    if (!plan || !plan.activatedAt) return c.json(null);

    const msPerDay = 86_400_000;
    const daysSince = Math.floor((Date.now() - new Date(plan.activatedAt).getTime()) / msPerDay);
    const currentWeekIndex = Math.floor(daysSince / plan.microcycleLength) % plan.mesocycleLength;
    const currentDayIndex = daysSince % plan.microcycleLength;

    const logs = await db.query.planDayLogs.findMany({
      where: and(eq(planDayLogs.trainingPlanId, plan.id), eq(planDayLogs.userId, userId)),
    });

    const logMap = new Map<string, string[]>();
    for (const l of logs) {
      const key = `${l.weekIndex}:${l.dayIndex}`;
      const arr = logMap.get(key) ?? [];
      arr.push(l.status);
      logMap.set(key, arr);
    }

    function isDayCompleted(key: string, hasWorkout: boolean, hasCardio: boolean): boolean {
      const statuses = logMap.get(key) ?? [];
      if (statuses.includes("completed")) return true;
      const workoutDone = !hasWorkout || statuses.includes("workout_completed");
      const cardioDone = !hasCardio || statuses.includes("cardio_completed");
      return workoutDone && cardioDone;
    }

    function isDaySkipped(key: string): boolean {
      const statuses = logMap.get(key) ?? [];
      return (
        statuses.includes("skipped") ||
        statuses.includes("workout_skipped") ||
        statuses.includes("cardio_skipped")
      );
    }

    const trainingDaysByWeek = plan.microcycles.map((mc) => ({
      weekIndex: mc.position - 1,
      days: mc.days
        .filter((d) => d.type === "training")
        .map((d) => ({
          dayIndex: d.dayNumber - 1,
          hasWorkout: !!d.workoutTemplateId,
          hasCardio: !!d.cardioTemplateId,
        })),
    }));

    let totalPlanned = 0;
    let totalCompleted = 0;
    let totalSkipped = 0;
    let totalPending = 0;

    const weeks = trainingDaysByWeek.map(({ weekIndex, days }) => {
      let planned = 0;
      let completed = 0;
      let skipped = 0;
      let pending = 0;

      for (const { dayIndex: di, hasWorkout, hasCardio } of days) {
        const isPast =
          weekIndex < currentWeekIndex || (weekIndex === currentWeekIndex && di < currentDayIndex);
        if (!isPast) continue;

        planned++;
        const key = `${weekIndex}:${di}`;
        if (isDayCompleted(key, hasWorkout, hasCardio)) completed++;
        else if (isDaySkipped(key)) skipped++;
        else pending++;
      }

      return { weekIndex, planned, completed, skipped, pending };
    });

    for (const w of weeks) {
      totalPlanned += w.planned;
      totalCompleted += w.completed;
      totalSkipped += w.skipped;
      totalPending += w.pending;
    }

    const completionRate = totalPlanned > 0 ? totalCompleted / totalPlanned : 0;

    type DayOccurrence = {
      weekIndex: number;
      dayIndex: number;
      hasWorkout: boolean;
      hasCardio: boolean;
    };
    const pastTrainingDays: DayOccurrence[] = [];

    for (const { weekIndex, days } of trainingDaysByWeek) {
      for (const { dayIndex: di, hasWorkout, hasCardio } of days) {
        const isPast =
          weekIndex < currentWeekIndex || (weekIndex === currentWeekIndex && di < currentDayIndex);
        if (isPast) pastTrainingDays.push({ weekIndex, dayIndex: di, hasWorkout, hasCardio });
      }
    }

    pastTrainingDays.sort((a, b) =>
      a.weekIndex !== b.weekIndex ? a.weekIndex - b.weekIndex : a.dayIndex - b.dayIndex,
    );

    let currentStreak = 0;
    let longestStreak = 0;
    let runningStreak = 0;

    for (const { weekIndex, dayIndex, hasWorkout, hasCardio } of pastTrainingDays) {
      const key = `${weekIndex}:${dayIndex}`;
      if (isDayCompleted(key, hasWorkout, hasCardio)) {
        runningStreak++;
        if (runningStreak > longestStreak) longestStreak = runningStreak;
      } else {
        runningStreak = 0;
      }
    }
    currentStreak = runningStreak;

    const completedSessionIds = logs
      .filter(
        (l) => (l.status === "completed" || l.status === "workout_completed") && l.workoutSessionId,
      )
      .map((l) => l.workoutSessionId as string);

    let totalSets = 0;
    let totalReps = 0;
    let totalWeightKg = 0;

    if (completedSessionIds.length > 0) {
      for (const sessionId of completedSessionIds) {
        const entries = await db.query.exerciseEntries.findMany({
          where: eq(exerciseEntries.workoutSessionId, sessionId),
          with: { sets: true },
        });
        for (const entry of entries) {
          for (const s of entry.sets) {
            if (!s.completed) continue;
            totalSets++;
            totalReps += s.reps ?? 0;
            totalWeightKg += (s.reps ?? 0) * (s.weightKg ?? 0);
          }
        }
      }
    }

    // --- Strength sub-metrics ---
    const strengthWeeks2 = trainingDaysByWeek.map(({ weekIndex, days }) => {
      let planned = 0,
        completed = 0,
        skipped = 0,
        pending = 0;
      for (const { dayIndex: di, hasWorkout } of days) {
        if (!hasWorkout) continue;
        const isPast =
          weekIndex < currentWeekIndex || (weekIndex === currentWeekIndex && di < currentDayIndex);
        if (!isPast) continue;
        planned++;
        const key = `${weekIndex}:${di}`;
        const statuses = logMap.get(key) ?? [];
        if (statuses.includes("completed") || statuses.includes("workout_completed")) completed++;
        else if (statuses.includes("skipped") || statuses.includes("workout_skipped")) skipped++;
        else pending++;
      }
      return { weekIndex, planned, completed, skipped, pending };
    });
    const strengthTotals2 = strengthWeeks2.reduce(
      (acc, w) => ({
        planned: acc.planned + w.planned,
        completed: acc.completed + w.completed,
        skipped: acc.skipped + w.skipped,
        pending: acc.pending + w.pending,
      }),
      { planned: 0, completed: 0, skipped: 0, pending: 0 },
    );

    // --- Cardio sub-metrics ---
    const cardioWeeks2 = trainingDaysByWeek.map(({ weekIndex, days }) => {
      let planned = 0,
        completed = 0,
        skipped = 0,
        pending = 0;
      for (const { dayIndex: di, hasCardio } of days) {
        if (!hasCardio) continue;
        const isPast =
          weekIndex < currentWeekIndex || (weekIndex === currentWeekIndex && di < currentDayIndex);
        if (!isPast) continue;
        planned++;
        const key = `${weekIndex}:${di}`;
        const statuses = logMap.get(key) ?? [];
        if (statuses.includes("completed") || statuses.includes("cardio_completed")) completed++;
        else if (statuses.includes("skipped") || statuses.includes("cardio_skipped")) skipped++;
        else pending++;
      }
      return { weekIndex, planned, completed, skipped, pending };
    });
    const cardioTotals2 = cardioWeeks2.reduce(
      (acc, w) => ({
        planned: acc.planned + w.planned,
        completed: acc.completed + w.completed,
        skipped: acc.skipped + w.skipped,
        pending: acc.pending + w.pending,
      }),
      { planned: 0, completed: 0, skipped: 0, pending: 0 },
    );

    return c.json({
      completionRate: Math.round(completionRate * 100) / 100,
      totalPlanned,
      totalCompleted,
      totalSkipped,
      totalPending,
      currentStreak,
      longestStreak,
      totalVolume: {
        sets: totalSets,
        reps: totalReps,
        weightKg: Math.round(totalWeightKg),
      },
      weeks,
      strength: { ...strengthTotals2, weeks: strengthWeeks2.filter((w) => w.planned > 0) },
      cardio: { ...cardioTotals2, weeks: cardioWeeks2.filter((w) => w.planned > 0) },
    });
  })

  // Get single plan with full structure
  .get("/:id", async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.param();
    const db = getDb();

    // Step 1: fetch plan skeleton — avoid deeply-nested alias bug in Drizzle
    // by NOT including `exercise` inside `templateExercises` here.
    const plan = await db.query.trainingPlans.findFirst({
      where: and(eq(trainingPlans.id, id), eq(trainingPlans.userId, userId)),
      with: {
        microcycles: {
          orderBy: (pm, { asc }) => [asc(pm.position)],
          with: {
            days: {
              orderBy: (pd, { asc }) => [asc(pd.dayNumber)],
              with: {
                workoutTemplate: {
                  with: { templateExercises: true },
                },
                cardioTemplate: {
                  with: { cardioTemplateExercises: true },
                },
              },
            },
          },
        },
      },
    });
    if (!plan) return c.json({ error: "Plan not found" }, 404);

    // Step 2: collect all exerciseIds referenced by template exercises,
    // fetch them in one query, then stitch into the plan response.
    const allExerciseIds = new Set<string>();
    for (const mc of plan.microcycles) {
      for (const day of mc.days) {
        if (day.workoutTemplate) {
          for (const te of day.workoutTemplate.templateExercises) {
            allExerciseIds.add(te.exerciseId);
          }
        }
      }
    }

    const exerciseMap: Record<string, Record<string, unknown>> = {};
    if (allExerciseIds.size > 0) {
      const rows = await db
        .select()
        .from(exercises)
        .where(inArray(exercises.id, [...allExerciseIds]));
      for (const ex of rows) exerciseMap[ex.id] = ex;
    }

    // Attach exercise objects to each templateExercise
    const enriched = {
      ...plan,
      microcycles: plan.microcycles.map((mc) => ({
        ...mc,
        days: mc.days.map((day) => ({
          ...day,
          workoutTemplate: day.workoutTemplate
            ? {
                ...day.workoutTemplate,
                templateExercises: day.workoutTemplate.templateExercises.map((te) => ({
                  ...te,
                  exercise: exerciseMap[te.exerciseId] ?? null,
                })),
              }
            : null,
        })),
      })),
    };

    // Build a per-slot status map: key = "weekIndex:dayIndex" (0-based)
    // Returns per-component statuses so the UI can show exactly what was skipped/done.
    const rawLogs = await db
      .select({
        weekIndex: planDayLogs.weekIndex,
        dayIndex: planDayLogs.dayIndex,
        status: planDayLogs.status,
      })
      .from(planDayLogs)
      .where(and(eq(planDayLogs.trainingPlanId, plan.id), eq(planDayLogs.userId, userId)));

    // Accumulate all statuses per slot (keep highest priority per component)
    // Priority within a component: skipped > completed
    type SlotLog = { workout?: string; cardio?: string };
    const componentPriority = (s: string) => (s.includes("skipped") ? 1 : 0);
    const dayLogs: Record<string, SlotLog> = {};
    for (const log of rawLogs) {
      const key = `${log.weekIndex}:${log.dayIndex}`;
      if (!dayLogs[key]) dayLogs[key] = {};
      const slot = dayLogs[key];
      if (log.status === "workout_skipped" || log.status === "workout_completed") {
        if (!slot.workout || componentPriority(log.status) > componentPriority(slot.workout)) {
          slot.workout = log.status;
        }
      } else if (log.status === "cardio_skipped" || log.status === "cardio_completed") {
        if (!slot.cardio || componentPriority(log.status) > componentPriority(slot.cardio)) {
          slot.cardio = log.status;
        }
      } else if (log.status === "skipped") {
        // Legacy full-day skip: mark both
        slot.workout = slot.workout ?? "workout_skipped";
        slot.cardio = slot.cardio ?? "cardio_skipped";
      } else if (log.status === "completed") {
        slot.workout = slot.workout ?? "workout_completed";
        slot.cardio = slot.cardio ?? "cardio_completed";
      }
    }

    return c.json({ ...enriched, dayLogs });
  })

  // Create plan — auto-creates microcycles and empty day stubs
  .post("/", zValidator("json", createPlanSchema), async (c) => {
    const userId = getUserId(c);
    const data = c.req.valid("json");
    const db = getDb();

    const existingPlan = await db.query.trainingPlans.findFirst({
      where: eq(trainingPlans.userId, userId),
    });
    if (existingPlan) {
      return c.json({ error: "You already have a training plan." }, 409);
    }

    const [plan] = await db
      .insert(trainingPlans)
      .values({ ...data, userId })
      .returning();

    for (let pos = 1; pos <= data.mesocycleLength; pos++) {
      const [mc] = await db
        .insert(planMicrocycles)
        .values({ trainingPlanId: plan.id, position: pos })
        .returning();

      const dayRows = Array.from({ length: data.microcycleLength }, (_, i) => ({
        planMicrocycleId: mc.id,
        dayNumber: i + 1,
        type: "training" as const,
      }));
      await db.insert(planDays).values(dayRows);
    }

    return c.json(plan, 201);
  })

  // Update plan metadata
  .put("/:id", zValidator("json", updatePlanSchema), async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.param();
    const data = c.req.valid("json");
    const db = getDb();

    // Enforce single active plan
    if (data.status === "active") {
      const existing = await db.query.trainingPlans.findFirst({
        where: and(
          eq(trainingPlans.userId, userId),
          eq(trainingPlans.status, "active"),
          ne(trainingPlans.id, id),
        ),
      });
      if (existing) {
        return c.json(
          {
            error: `Plan "${existing.name}" is already active. Complete or deactivate it before activating another.`,
          },
          409,
        );
      }

      // Validate startDate is not in the past
      const today = new Date().toISOString().slice(0, 10);
      const startDate = data.startDate ?? today;
      if (startDate < today) {
        return c.json({ error: "Start date cannot be in the past." }, 400);
      }

      const { startDate: _sd, ...rest } = data;
      const [updated] = await db
        .update(trainingPlans)
        .set({ ...rest, activatedAt: new Date(), startDate, updatedAt: new Date() })
        .where(and(eq(trainingPlans.id, id), eq(trainingPlans.userId, userId)))
        .returning();

      if (!updated) return c.json({ error: "Plan not found" }, 404);

      // Close all mode="plan" coach conversations for this user —
      // a plan is now active so those conversations are superseded.
      await db
        .update(coachConversations)
        .set({ status: "closed", updatedAt: new Date() })
        .where(and(eq(coachConversations.userId, userId), eq(coachConversations.mode, "plan")));

      return c.json(updated);
    }

    const { startDate: _sd, ...rest } = data;
    const [updated] = await db
      .update(trainingPlans)
      .set({ ...rest, updatedAt: new Date() })
      .where(and(eq(trainingPlans.id, id), eq(trainingPlans.userId, userId)))
      .returning();

    if (!updated) return c.json({ error: "Plan not found" }, 404);
    return c.json(updated);
  })

  // Delete plan
  .delete("/:id", async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.param();
    const db = getDb();

    await db
      .delete(trainingPlans)
      .where(and(eq(trainingPlans.id, id), eq(trainingPlans.userId, userId)));

    return c.json({ success: true });
  })

  // Add a new week (microcycle) to the plan
  .post("/:id/microcycles", async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.param();
    const db = getDb();

    const plan = await db.query.trainingPlans.findFirst({
      where: and(eq(trainingPlans.id, id), eq(trainingPlans.userId, userId)),
      with: { microcycles: true },
    });
    if (!plan) return c.json({ error: "Plan not found" }, 404);

    const mc = await addMicrocycle(db, id, plan.microcycleLength, plan.microcycles);
    return c.json(mc, 201);
  })

  // Clone a week — adds a new week pre-filled with deep-copied templates
  .post("/:id/microcycles/:micId/clone", async (c) => {
    const userId = getUserId(c);
    const { id, micId } = c.req.param();
    const db = getDb();

    const plan = await db.query.trainingPlans.findFirst({
      where: and(eq(trainingPlans.id, id), eq(trainingPlans.userId, userId)),
      with: { microcycles: true },
    });
    if (!plan) return c.json({ error: "Plan not found" }, 404);

    const sourceMc = await db.query.planMicrocycles.findFirst({
      where: and(eq(planMicrocycles.id, micId), eq(planMicrocycles.trainingPlanId, id)),
      with: {
        days: {
          orderBy: (pd, { asc }) => [asc(pd.dayNumber)],
          with: {
            workoutTemplate: { with: { templateExercises: true } },
            cardioTemplate: { with: { cardioTemplateExercises: true } },
          },
        },
      },
    });
    if (!sourceMc) return c.json({ error: "Week not found" }, 404);

    // Create blank week (reuses addMicrocycle — inserts empty day stubs)
    const newMc = await addMicrocycle(
      db,
      id,
      plan.microcycleLength,
      plan.microcycles,
      sourceMc.name,
    );

    // Overwrite each stub with cloned templates in parallel
    await Promise.all(
      sourceMc.days.map(async (day) => {
        const { workoutTemplateId, cardioTemplateId } = await cloneTemplatesForDay(db, userId, day);
        await db
          .update(planDays)
          .set({
            type: day.type as "training" | "rest",
            workoutTemplateId,
            cardioTemplateId,
            notes: day.notes,
          })
          .where(
            and(eq(planDays.planMicrocycleId, newMc.id), eq(planDays.dayNumber, day.dayNumber)),
          );
      }),
    );

    return c.json({ id: newMc.id }, 201);
  })

  // Clone a day — extends the grid by one column, then fills the source week's new slot
  .post("/:id/microcycles/:micId/days/:dayNum/clone", async (c) => {
    const userId = getUserId(c);
    const { id, micId, dayNum } = c.req.param();
    const db = getDb();

    const plan = await db.query.trainingPlans.findFirst({
      where: and(eq(trainingPlans.id, id), eq(trainingPlans.userId, userId)),
      with: { microcycles: true },
    });
    if (!plan) return c.json({ error: "Plan not found" }, 404);

    const sourceMc = await db.query.planMicrocycles.findFirst({
      where: and(eq(planMicrocycles.id, micId), eq(planMicrocycles.trainingPlanId, id)),
      with: {
        days: {
          with: {
            workoutTemplate: { with: { templateExercises: true } },
            cardioTemplate: { with: { cardioTemplateExercises: true } },
          },
        },
      },
    });
    if (!sourceMc) return c.json({ error: "Week not found" }, 404);

    const sourceDay = sourceMc.days.find((d) => d.dayNumber === Number(dayNum));
    if (!sourceDay) return c.json({ error: "Day not found" }, 404);

    // Extend every week by one empty stub (reuses extendDays)
    const newDayNumber = await extendDays(db, id, plan.microcycles, plan.microcycleLength);

    // Clone templates and overwrite the stub in the source week only
    const { workoutTemplateId, cardioTemplateId } = await cloneTemplatesForDay(
      db,
      userId,
      sourceDay,
    );
    await db
      .update(planDays)
      .set({
        type: sourceDay.type as "training" | "rest",
        workoutTemplateId,
        cardioTemplateId,
        notes: sourceDay.notes,
      })
      .where(and(eq(planDays.planMicrocycleId, micId), eq(planDays.dayNumber, newDayNumber)));

    return c.json({ dayNumber: newDayNumber }, 201);
  })

  // Add a day to every week (increment microcycleLength globally)
  .post("/:id/days/extend", async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.param();
    const db = getDb();

    const plan = await db.query.trainingPlans.findFirst({
      where: and(eq(trainingPlans.id, id), eq(trainingPlans.userId, userId)),
      with: { microcycles: true },
    });
    if (!plan) return c.json({ error: "Plan not found" }, 404);

    await extendDays(db, id, plan.microcycles, plan.microcycleLength);

    const updated = await db.query.trainingPlans.findFirst({
      where: eq(trainingPlans.id, id),
    });
    return c.json(updated);
  })

  // Upsert a single day within a microcycle
  .put("/:id/microcycles/:micId/days/:dayNum", zValidator("json", upsertDaySchema), async (c) => {
    const userId = getUserId(c);
    const { id, micId, dayNum } = c.req.param();
    const data = c.req.valid("json");
    const db = getDb();

    const mc = await db.query.planMicrocycles.findFirst({
      where: eq(planMicrocycles.id, micId),
      with: { trainingPlan: true },
    });
    if (!mc || mc.trainingPlan.id !== id || mc.trainingPlan.userId !== userId) {
      return c.json({ error: "Not found" }, 404);
    }

    const dayNumber = parseInt(dayNum, 10);
    const existing = await db.query.planDays.findFirst({
      where: and(eq(planDays.planMicrocycleId, micId), eq(planDays.dayNumber, dayNumber)),
    });

    // Clear template IDs when day type is not training
    const payload = {
      ...data,
      workoutTemplateId: data.type === "training" ? (data.workoutTemplateId ?? null) : null,
      cardioTemplateId: data.type === "training" ? (data.cardioTemplateId ?? null) : null,
    };

    if (existing) {
      const [updated] = await db
        .update(planDays)
        .set(payload)
        .where(eq(planDays.id, existing.id))
        .returning();
      await db.update(trainingPlans).set({ updatedAt: new Date() }).where(eq(trainingPlans.id, id));
      return c.json(updated);
    }

    const [created] = await db
      .insert(planDays)
      .values({ planMicrocycleId: micId, dayNumber, ...payload })
      .returning();
    await db.update(trainingPlans).set({ updatedAt: new Date() }).where(eq(trainingPlans.id, id));
    return c.json(created, 201);
  })

  // Delete a microcycle (week) — resequences positions and decrements mesocycleLength
  .delete("/:id/microcycles/:micId", async (c) => {
    const userId = getUserId(c);
    const { id, micId } = c.req.param();
    const db = getDb();

    const plan = await db.query.trainingPlans.findFirst({
      where: and(eq(trainingPlans.id, id), eq(trainingPlans.userId, userId)),
      with: { microcycles: { orderBy: (pm, { asc }) => [asc(pm.position)] } },
    });
    if (!plan) return c.json({ error: "Plan not found" }, 404);
    if (plan.microcycles.length <= 1) return c.json({ error: "Cannot delete the only week" }, 400);

    const target = plan.microcycles.find((m) => m.id === micId);
    if (!target) return c.json({ error: "Week not found" }, 404);

    // Delete the microcycle (cascade deletes its days)
    await db.delete(planMicrocycles).where(eq(planMicrocycles.id, micId));

    // Resequence positions of remaining weeks
    const remaining = plan.microcycles.filter((m) => m.id !== micId);
    for (let i = 0; i < remaining.length; i++) {
      await db
        .update(planMicrocycles)
        .set({ position: i + 1 })
        .where(eq(planMicrocycles.id, remaining[i].id));
    }

    await db
      .update(trainingPlans)
      .set({ mesocycleLength: remaining.length, updatedAt: new Date() })
      .where(eq(trainingPlans.id, id));

    return c.json({ success: true });
  })

  // Remove the last day from every week (decrement microcycleLength)
  .delete("/:id/days/last", async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.param();
    const db = getDb();

    const plan = await db.query.trainingPlans.findFirst({
      where: and(eq(trainingPlans.id, id), eq(trainingPlans.userId, userId)),
      with: { microcycles: true },
    });
    if (!plan) return c.json({ error: "Plan not found" }, 404);
    if (plan.microcycleLength <= 1) return c.json({ error: "Cannot delete the only day" }, 400);

    const lastDay = plan.microcycleLength;

    for (const mc of plan.microcycles) {
      await db
        .delete(planDays)
        .where(and(eq(planDays.planMicrocycleId, mc.id), eq(planDays.dayNumber, lastDay)));
    }

    const [updated] = await db
      .update(trainingPlans)
      .set({ microcycleLength: lastDay - 1, updatedAt: new Date() })
      .where(eq(trainingPlans.id, id))
      .returning();

    return c.json(updated);
  })

  // Delete any day column by dayNumber — shifts higher days down, decrements microcycleLength
  .delete("/:id/days/:dayNumber", async (c) => {
    const userId = getUserId(c);
    const { id, dayNumber: dayNumberParam } = c.req.param();
    const dayNumber = parseInt(dayNumberParam, 10);
    const db = getDb();

    const plan = await db.query.trainingPlans.findFirst({
      where: and(eq(trainingPlans.id, id), eq(trainingPlans.userId, userId)),
      with: { microcycles: true },
    });
    if (!plan) return c.json({ error: "Plan not found" }, 404);
    if (plan.microcycleLength <= 1) return c.json({ error: "Cannot delete the only day" }, 400);
    if (dayNumber < 1 || dayNumber > plan.microcycleLength)
      return c.json({ error: "Day number out of range" }, 400);

    // Delete the target day from every microcycle, then shift higher dayNumbers down by 1
    for (const mc of plan.microcycles) {
      await db
        .delete(planDays)
        .where(and(eq(planDays.planMicrocycleId, mc.id), eq(planDays.dayNumber, dayNumber)));
      await db
        .update(planDays)
        .set({ dayNumber: sql`${planDays.dayNumber} - 1` })
        .where(and(eq(planDays.planMicrocycleId, mc.id), gt(planDays.dayNumber, dayNumber)));
    }

    const [updated] = await db
      .update(trainingPlans)
      .set({ microcycleLength: plan.microcycleLength - 1, updatedAt: new Date() })
      .where(eq(trainingPlans.id, id))
      .returning();

    return c.json(updated);
  })

  // Reorder days across all weeks simultaneously — accepts new order as array of current dayNumbers
  .patch(
    "/:id/days/reorder",
    zValidator("json", z.object({ order: z.array(z.number().int().min(1)) })),
    async (c) => {
      const userId = getUserId(c);
      const { id } = c.req.param();
      const { order } = c.req.valid("json");
      const db = getDb();

      const plan = await db.query.trainingPlans.findFirst({
        where: and(eq(trainingPlans.id, id), eq(trainingPlans.userId, userId)),
        with: { microcycles: true },
      });
      if (!plan) return c.json({ error: "Plan not found" }, 404);
      if (order.length !== plan.microcycleLength)
        return c.json({ error: "Order length must match microcycleLength" }, 400);

      // Build mapping: oldDayNumber → newPosition (1-based index in new order)
      // order[i] = old day number that should now be at position i+1
      const mapping = new Map<number, number>();
      order.forEach((oldDay, idx) => mapping.set(oldDay, idx + 1));

      // Only process days that actually change position
      const changedPairs = [...mapping.entries()].filter(([old, newPos]) => old !== newPos);
      if (changedPairs.length === 0) return c.json({ success: true });

      // Use a large temp offset so phase-1 values never collide with real day numbers
      const offset = 10_000;

      for (const mc of plan.microcycles) {
        // Phase 1: move changed rows to temp values (avoids unique-constraint collisions)
        for (const [oldDay, _newPos] of changedPairs) {
          await db
            .update(planDays)
            .set({ dayNumber: oldDay + offset })
            .where(and(eq(planDays.planMicrocycleId, mc.id), eq(planDays.dayNumber, oldDay)));
        }
        // Phase 2: settle each temp row to its final position
        for (const [oldDay, newPos] of changedPairs) {
          await db
            .update(planDays)
            .set({ dayNumber: newPos })
            .where(
              and(eq(planDays.planMicrocycleId, mc.id), eq(planDays.dayNumber, oldDay + offset)),
            );
        }
      }

      return c.json({ success: true });
    },
  )

  // Update microcycle name
  .patch("/:id/microcycles/:micId", async (c) => {
    const userId = getUserId(c);
    const { id, micId } = c.req.param();
    const { name } = await c.req.json<{ name?: string }>();
    const db = getDb();

    const mc = await db.query.planMicrocycles.findFirst({
      where: eq(planMicrocycles.id, micId),
      with: { trainingPlan: true },
    });
    if (!mc || mc.trainingPlan.id !== id || mc.trainingPlan.userId !== userId) {
      return c.json({ error: "Not found" }, 404);
    }

    const [updated] = await db
      .update(planMicrocycles)
      .set({ name: name ?? null })
      .where(eq(planMicrocycles.id, micId))
      .returning();
    return c.json(updated);
  })

  // Import a plan from AI <plan> JSON
  .post("/from-ai", zValidator("json", fromAiSchema), async (c) => {
    const userId = getUserId(c);
    const data = c.req.valid("json");
    const db = getDb();

    // ── Guard: block if active plan exists; delete stale draft ───────────────
    const existingPlan = await db.query.trainingPlans.findFirst({
      where: eq(trainingPlans.userId, userId),
    });
    if (existingPlan?.status === "active") {
      return c.json({ error: "You already have an active training plan." }, 409);
    }
    if (existingPlan?.status === "draft") {
      await db.delete(trainingPlans).where(eq(trainingPlans.id, existingPlan.id));
    }

    const microcycleLength = Math.max(...data.weeks.flatMap((w) => w.days.map((d) => d.day)), 1);

    // ── 1. Resolve all exercises in two queries (SELECT + INSERT missing) ────
    const allStrengthExercises = data.weeks
      .flatMap((w) => w.days)
      .flatMap((d) => d.workout?.exercises ?? []);
    const exerciseIdMap = await resolveExercises(db, allStrengthExercises);

    // ── 2. Insert the plan (1 query) ─────────────────────────────────────────
    const [plan] = await db
      .insert(trainingPlans)
      .values({
        userId,
        name: data.name,
        description: data.description ?? null,
        microcycleLength,
        mesocycleLength: data.weeks.length,
      })
      .returning();

    // ── 3. Insert all microcycles in one batch ────────────────────────────────
    const microcycleRows = await db
      .insert(planMicrocycles)
      .values(data.weeks.map((w) => ({ trainingPlanId: plan.id, position: w.week })))
      .returning();

    // ── 4. For each week, build all templates + days in parallel ─────────────
    await Promise.all(
      data.weeks.map(async (week, wi) => {
        const mc = microcycleRows[wi];

        // Collect all training days that need templates
        type DayTemplateResult = {
          dayNum: number;
          strengthTemplateId: string | null;
          cardioTemplateId: string | null;
          isRest: boolean;
          restNote?: string | null;
        };

        // Process every day slot in parallel
        const dayResults = await Promise.all(
          Array.from({ length: microcycleLength }, async (_, i): Promise<DayTemplateResult> => {
            const dayNum = i + 1;
            const day = week.days.find((d) => d.day === dayNum);

            if (!day || day.rest) {
              return {
                dayNum,
                strengthTemplateId: null,
                cardioTemplateId: null,
                isRest: day?.rest === true,
                restNote: day?.restNote,
              };
            }

            // Strength and cardio templates are independent — create in parallel
            const [strengthTemplateId, cardioTemplateId] = await Promise.all([
              // Strength template
              (async () => {
                const exList = day.workout?.exercises ?? [];
                if (!day.workout || exList.length === 0) return null;
                const [tmpl] = await db
                  .insert(workoutTemplates)
                  .values({ userId, name: day.workout.name })
                  .returning();
                if (exList.length > 0) {
                  await db.insert(templateExercises).values(
                    exList.map((ex, order) => ({
                      workoutTemplateId: tmpl.id,
                      exerciseId: exerciseIdMap.get(ex.name.toLowerCase()) ?? "",
                      order: order + 1,
                      targetSets: ex.sets,
                      targetRepMin: ex.repMin ?? 0,
                      targetRepMax: ex.repMax ?? 0,
                      rir: ex.rir ?? null,
                      restSeconds: ex.restSeconds ?? null,
                    })),
                  );
                }
                return tmpl.id;
              })(),
              // Cardio template
              (async () => {
                const exList = day.cardio?.exercises ?? [];
                if (!day.cardio || exList.length === 0) return null;
                const [tmpl] = await db
                  .insert(cardioTemplates)
                  .values({ userId, name: day.cardio.name })
                  .returning();
                await db.insert(cardioTemplateExercises).values(
                  exList.map((ex, order) => ({
                    cardioTemplateId: tmpl.id,
                    name: ex.name,
                    zone: ex.zone ?? null,
                    kilometers: ex.kilometers ?? null,
                    order: order + 1,
                  })),
                );
                return tmpl.id;
              })(),
            ]);

            return { dayNum, strengthTemplateId, cardioTemplateId, isRest: false };
          }),
        );

        // ── 5. Batch insert all plan_days for this week in one query ──────────
        await db.insert(planDays).values(
          dayResults.map((r) => ({
            planMicrocycleId: mc.id,
            dayNumber: r.dayNum,
            type: r.isRest ? ("rest" as const) : ("training" as const),
            workoutTemplateId: r.strengthTemplateId,
            cardioTemplateId: r.cardioTemplateId,
            notes: r.isRest ? (r.restNote ?? null) : null,
          })),
        );
      }),
    );

    return c.json({ id: plan.id }, 201);
  });
