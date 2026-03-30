import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, isNotNull } from "drizzle-orm";
import {
  workoutSessions,
  exerciseEntries,
  exerciseSets,
  personalRecords,
  workoutTemplates,
  trainingPlans,
  planDays,
  planDayLogs,
} from "@fitforge/db";
import { getDb } from "../../infrastructure/db.js";
import { authMiddleware, getUserId } from "../middleware/auth.js";

const startSessionSchema = z.object({
  name: z.string().optional().nullable(),
  templateId: z.string().uuid().optional(),
  // Plan linkage — required when an active plan exists
  planDayId: z.string().uuid().optional(),
  weekIndex: z.number().int().min(0).optional(),
  dayIndex: z.number().int().min(0).optional(),
});

const addExerciseSchema = z.object({
  exerciseId: z.string().uuid(),
  order: z.number().int().min(1),
});

const logSetSchema = z.object({
  setNumber: z.number().int().min(1),
  type: z.enum(["warmup", "working", "dropset", "failure"]).default("working"),
  weightKg: z.number().optional().nullable(),
  reps: z.number().int().optional().nullable(),
  rir: z.number().int().min(0).optional().nullable(),
  durationSeconds: z.number().int().optional().nullable(),
  restSeconds: z.number().int().optional().nullable(),
  completed: z.boolean().default(false),
});

export const sessionRoutes = new Hono()
  .use("*", authMiddleware)

  .get("/", async (c) => {
    const userId = getUserId(c);
    const db = getDb();
    const limit = Number(c.req.query("limit") ?? 20);
    const planDayId = c.req.query("planDayId");

    const sessions = await db.query.workoutSessions.findMany({
      where: and(
        eq(workoutSessions.userId, userId),
        planDayId ? eq(workoutSessions.planDayId, planDayId) : isNotNull(workoutSessions.id),
      ),
      orderBy: [desc(workoutSessions.startedAt)],
      limit,
      with: {
        exerciseEntries: {
          with: {
            exercise: true,
            sets: { orderBy: (s, { asc }) => [asc(s.setNumber)] },
          },
          orderBy: (e, { asc }) => [asc(e.order)],
        },
      },
    });

    return c.json(sessions);
  })

  .get("/:id", async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.param();
    const db = getDb();

    const session = await db.query.workoutSessions.findFirst({
      where: and(eq(workoutSessions.id, id), eq(workoutSessions.userId, userId)),
      with: {
        exerciseEntries: {
          with: {
            exercise: true,
            sets: { orderBy: (s, { asc }) => [asc(s.setNumber)] },
          },
          orderBy: (e, { asc }) => [asc(e.order)],
        },
      },
    });

    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json(session);
  })

  .post("/", zValidator("json", startSessionSchema), async (c) => {
    const userId = getUserId(c);
    const data = c.req.valid("json");
    const db = getDb();

    // Guard: require an active plan to start a session
    const activePlan = await db.query.trainingPlans.findFirst({
      where: and(eq(trainingPlans.userId, userId), eq(trainingPlans.status, "active")),
    });

    if (!activePlan) {
      return c.json({ error: "No active training plan. Activate a plan to start a workout." }, 403);
    }

    // Guard: planDayId must be provided and must belong to the active plan
    if (!data.planDayId || data.weekIndex == null || data.dayIndex == null) {
      return c.json({ error: "planDayId, weekIndex, and dayIndex are required." }, 400);
    }

    // Validate the planDayId belongs to the user's active plan
    const planDay = await db.query.planDays.findFirst({
      where: eq(planDays.id, data.planDayId),
      with: { microcycle: { with: { trainingPlan: true } } },
    });

    if (!planDay || planDay.microcycle.trainingPlan.id !== activePlan.id) {
      return c.json({ error: "Invalid plan day for active plan." }, 400);
    }

    const [session] = await db
      .insert(workoutSessions)
      .values({
        userId,
        name: data.name ?? null,
        status: "in_progress",
        startedAt: new Date(),
        planDayId: data.planDayId,
        weekIndex: data.weekIndex,
        dayIndex: data.dayIndex,
      })
      .returning();

    // Record the plan day log as workout_completed (cardio component tracked separately)
    await db
      .insert(planDayLogs)
      .values({
        userId,
        trainingPlanId: activePlan.id,
        planDayId: data.planDayId,
        weekIndex: data.weekIndex,
        dayIndex: data.dayIndex,
        status: "workout_completed",
        workoutSessionId: session.id,
      })
      .onConflictDoNothing();

    // Seed exercises from template when templateId is provided
    if (data.templateId) {
      const template = await db.query.workoutTemplates.findFirst({
        where: and(eq(workoutTemplates.id, data.templateId), eq(workoutTemplates.userId, userId)),
        with: {
          templateExercises: {
            orderBy: (te, { asc }) => [asc(te.order)],
          },
        },
      });

      if (template && template.templateExercises.length > 0) {
        // Use the template name as the session name if none was provided
        if (!session.name) {
          await db
            .update(workoutSessions)
            .set({ name: template.name })
            .where(eq(workoutSessions.id, session.id));
          session.name = template.name;
        }
        const entries = await db
          .insert(exerciseEntries)
          .values(
            template.templateExercises.map((te) => ({
              workoutSessionId: session.id,
              exerciseId: te.exerciseId,
              order: te.order,
              targetRepMin: te.targetRepMin,
              targetRepMax: te.targetRepMax,
              targetRir: te.rir,
              restSeconds: te.restSeconds,
            })),
          )
          .returning();

        // Pre-populate sets based on targetSets from the template
        const setRows = entries.flatMap((entry, idx) => {
          const te = template.templateExercises[idx];
          return Array.from({ length: te.targetSets }, (_, i) => ({
            exerciseEntryId: entry.id,
            setNumber: i + 1,
            type: "working" as const,
            completed: false,
          }));
        });

        if (setRows.length > 0) {
          await db.insert(exerciseSets).values(setRows);
        }
      }
    }

    return c.json(session, 201);
  })

  .patch(
    "/:id",
    zValidator(
      "json",
      z.object({
        name: z.string().optional().nullable(),
        status: z.enum(["in_progress", "completed", "cancelled"]).optional(),
        notes: z.string().optional().nullable(),
      }),
    ),
    async (c) => {
      const userId = getUserId(c);
      const { id } = c.req.param();
      const updates = c.req.valid("json");
      const db = getDb();

      const completedAt = updates.status === "completed" ? new Date() : undefined;

      const [updated] = await db
        .update(workoutSessions)
        .set({
          ...updates,
          ...(completedAt ? { completedAt } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(workoutSessions.id, id), eq(workoutSessions.userId, userId)))
        .returning();

      if (!updated) return c.json({ error: "Session not found" }, 404);
      return c.json(updated);
    },
  )

  // Add exercise to session
  .post("/:id/exercises", zValidator("json", addExerciseSchema), async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.param();
    const data = c.req.valid("json");
    const db = getDb();

    // Verify session ownership
    const session = await db.query.workoutSessions.findFirst({
      where: and(eq(workoutSessions.id, id), eq(workoutSessions.userId, userId)),
    });
    if (!session) return c.json({ error: "Session not found" }, 404);

    const [entry] = await db
      .insert(exerciseEntries)
      .values({ workoutSessionId: id, ...data })
      .returning();

    return c.json(entry, 201);
  })

  // Log a set
  .post("/:id/exercises/:entryId/sets", zValidator("json", logSetSchema), async (c) => {
    const userId = getUserId(c);
    const { id, entryId } = c.req.param();
    const data = c.req.valid("json");
    const db = getDb();

    // Verify ownership via session
    const entry = await db.query.exerciseEntries.findFirst({
      where: eq(exerciseEntries.id, entryId),
      with: { workoutSession: true },
    });

    if (!entry || entry.workoutSession.userId !== userId) {
      return c.json({ error: "Not found" }, 404);
    }

    const [set] = await db
      .insert(exerciseSets)
      .values({
        exerciseEntryId: entryId,
        ...data,
      })
      .returning();

    // Check for personal record (estimated 1RM via Epley formula)
    if (data.weightKg && data.reps && data.completed) {
      const estimated1rm = data.reps === 1 ? data.weightKg : data.weightKg * (1 + data.reps / 30);

      const existing = await db.query.personalRecords.findFirst({
        where: and(
          eq(personalRecords.userId, userId),
          eq(personalRecords.exerciseId, entry.exerciseId),
          eq(personalRecords.type, "estimated_1rm"),
        ),
      });

      if (!existing || existing.value < estimated1rm) {
        await db
          .insert(personalRecords)
          .values({
            userId,
            exerciseId: entry.exerciseId,
            type: "estimated_1rm",
            value: Math.round(estimated1rm * 10) / 10,
            workoutSessionId: id,
            previousValue: existing?.value ?? null,
            achievedAt: new Date(),
          })
          .onConflictDoNothing();
      }
    }

    return c.json(set, 201);
  })

  // Update a set
  .patch(
    "/:id/exercises/:entryId/sets/:setId",
    zValidator("json", logSetSchema.partial()),
    async (c) => {
      const { setId } = c.req.param();
      const data = c.req.valid("json");
      const db = getDb();

      const [updated] = await db
        .update(exerciseSets)
        .set({ ...data })
        .where(eq(exerciseSets.id, setId))
        .returning();

      if (!updated) return c.json({ error: "Set not found" }, 404);
      return c.json(updated);
    },
  )

  // Delete a set
  .delete("/:id/exercises/:entryId/sets/:setId", async (c) => {
    const userId = getUserId(c);
    const { id, entryId, setId } = c.req.param();
    const db = getDb();

    // Verify ownership via session
    const session = await db.query.workoutSessions.findFirst({
      where: and(eq(workoutSessions.id, id), eq(workoutSessions.userId, userId)),
    });
    if (!session) return c.json({ error: "Session not found" }, 404);

    const [deleted] = await db
      .delete(exerciseSets)
      .where(and(eq(exerciseSets.id, setId), eq(exerciseSets.exerciseEntryId, entryId)))
      .returning();

    if (!deleted) return c.json({ error: "Set not found" }, 404);
    return c.json({ ok: true });
  });
