import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import {
  workoutSessions,
  exerciseEntries,
  exerciseSets,
  personalRecords,
  exercises,
} from "@fitforge/db";
import { getDb } from "../../infrastructure/db.js";
import { authMiddleware, getUserId } from "../middleware/auth.js";

const startSessionSchema = z.object({
  name: z.string().optional().nullable(),
  templateId: z.string().uuid().optional(),
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
  rpe: z.number().min(1).max(10).optional().nullable(),
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

    const sessions = await db.query.workoutSessions.findMany({
      where: eq(workoutSessions.userId, userId),
      orderBy: [desc(workoutSessions.startedAt)],
      limit,
    });

    return c.json(sessions);
  })

  .get("/:id", async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.param();
    const db = getDb();

    const session = await db.query.workoutSessions.findFirst({
      where: and(
        eq(workoutSessions.id, id),
        eq(workoutSessions.userId, userId)
      ),
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

    const [session] = await db
      .insert(workoutSessions)
      .values({
        userId,
        name: data.name,
        status: "in_progress",
        startedAt: new Date(),
      })
      .returning();

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
      })
    ),
    async (c) => {
      const userId = getUserId(c);
      const { id } = c.req.param();
      const updates = c.req.valid("json");
      const db = getDb();

      const completedAt =
        updates.status === "completed" ? new Date() : undefined;

      const [updated] = await db
        .update(workoutSessions)
        .set({
          ...updates,
          ...(completedAt ? { completedAt } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workoutSessions.id, id),
            eq(workoutSessions.userId, userId)
          )
        )
        .returning();

      if (!updated) return c.json({ error: "Session not found" }, 404);
      return c.json(updated);
    }
  )

  // Add exercise to session
  .post(
    "/:id/exercises",
    zValidator("json", addExerciseSchema),
    async (c) => {
      const userId = getUserId(c);
      const { id } = c.req.param();
      const data = c.req.valid("json");
      const db = getDb();

      // Verify session ownership
      const session = await db.query.workoutSessions.findFirst({
        where: and(
          eq(workoutSessions.id, id),
          eq(workoutSessions.userId, userId)
        ),
      });
      if (!session) return c.json({ error: "Session not found" }, 404);

      const [entry] = await db
        .insert(exerciseEntries)
        .values({ workoutSessionId: id, ...data })
        .returning();

      return c.json(entry, 201);
    }
  )

  // Log a set
  .post(
    "/:id/exercises/:entryId/sets",
    zValidator("json", logSetSchema),
    async (c) => {
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
        .values({ exerciseEntryId: entryId, ...data })
        .returning();

      // Check for personal record (estimated 1RM via Epley formula)
      if (data.weightKg && data.reps && data.completed) {
        const estimated1rm =
          data.reps === 1
            ? data.weightKg
            : data.weightKg * (1 + data.reps / 30);

        const existing = await db.query.personalRecords.findFirst({
          where: and(
            eq(personalRecords.userId, userId),
            eq(personalRecords.exerciseId, entry.exerciseId),
            eq(personalRecords.type, "estimated_1rm")
          ),
        });

        if (!existing || Number(existing.value) < estimated1rm) {
          await db
            .insert(personalRecords)
            .values({
              userId,
              exerciseId: entry.exerciseId,
              type: "estimated_1rm",
              value: String(Math.round(estimated1rm * 10) / 10),
              workoutSessionId: id,
              previousValue: existing?.value ?? null,
              achievedAt: new Date(),
            })
            .onConflictDoNothing();
        }
      }

      return c.json(set, 201);
    }
  )

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
        .set(data)
        .where(eq(exerciseSets.id, setId))
        .returning();

      if (!updated) return c.json({ error: "Set not found" }, 404);
      return c.json(updated);
    }
  );
