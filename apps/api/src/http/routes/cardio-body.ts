import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import {
  cardioSessions,
  cardioSplits,
  weightEntries,
  bodyMeasurements,
} from "@fitforge/db";
import { getDb } from "../../infrastructure/db.js";
import { authMiddleware, getUserId } from "../middleware/auth.js";

const createCardioSchema = z.object({
  type: z.string(),
  startedAt: z.string().datetime().optional(),
  status: z
    .enum(["in_progress", "completed", "cancelled"])
    .default("completed"),
  distanceMeters: z.number().int().optional().nullable(),
  durationSeconds: z.number().int().optional().nullable(),
  avgPaceSecondsPerKm: z.number().int().optional().nullable(),
  avgHeartRate: z.number().int().optional().nullable(),
  maxHeartRate: z.number().int().optional().nullable(),
  caloriesBurned: z.number().int().optional().nullable(),
  elevationGainMeters: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
  splits: z
    .array(
      z.object({
        kilometer: z.number().int(),
        durationSeconds: z.number().int(),
        paceSecondsPerKm: z.number().int(),
      })
    )
    .optional()
    .default([]),
});

const weightSchema = z.object({
  date: z.string().date(),
  weightKg: z.number().positive(),
  notes: z.string().optional().nullable(),
});

const measurementSchema = z.object({
  date: z.string().date(),
  bodyFatPercent: z.number().optional().nullable(),
  chestCm: z.number().optional().nullable(),
  waistCm: z.number().optional().nullable(),
  hipsCm: z.number().optional().nullable(),
  bicepLeftCm: z.number().optional().nullable(),
  bicepRightCm: z.number().optional().nullable(),
  thighLeftCm: z.number().optional().nullable(),
  thighRightCm: z.number().optional().nullable(),
  calfLeftCm: z.number().optional().nullable(),
  calfRightCm: z.number().optional().nullable(),
  shouldersCm: z.number().optional().nullable(),
  neckCm: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const cardioRoutes = new Hono()
  .use("*", authMiddleware)

  .get("/", async (c) => {
    const userId = getUserId(c);
    const db = getDb();
    const limit = Number(c.req.query("limit") ?? 20);

    const sessions = await db.query.cardioSessions.findMany({
      where: eq(cardioSessions.userId, userId),
      orderBy: [desc(cardioSessions.startedAt)],
      limit,
      with: { splits: { orderBy: (s, { asc }) => [asc(s.kilometer)] } },
    });

    return c.json(sessions);
  })

  .post("/", zValidator("json", createCardioSchema), async (c) => {
    const userId = getUserId(c);
    const { splits, ...data } = c.req.valid("json");
    const db = getDb();

    const [session] = await db
      .insert(cardioSessions)
      .values({
        userId,
        ...data,
        startedAt: data.startedAt ? new Date(data.startedAt) : new Date(),
        completedAt: data.status === "completed" ? new Date() : null,
      })
      .returning();

    if (splits.length > 0) {
      await db
        .insert(cardioSplits)
        .values(splits.map((s) => ({ ...s, cardioSessionId: session.id })));
    }

    return c.json(session, 201);
  })

  .patch(
    "/:id",
    zValidator("json", createCardioSchema.partial()),
    async (c) => {
      const userId = getUserId(c);
      const { id } = c.req.param();
      const { splits, ...data } = c.req.valid("json");
      const db = getDb();

      const [updated] = await db
        .update(cardioSessions)
        .set({ ...data, updatedAt: new Date() })
        .where(
          and(eq(cardioSessions.id, id), eq(cardioSessions.userId, userId))
        )
        .returning();

      if (!updated) return c.json({ error: "Session not found" }, 404);
      return c.json(updated);
    }
  );

export const bodyRoutes = new Hono()
  .use("*", authMiddleware)

  .get("/weight", async (c) => {
    const userId = getUserId(c);
    const db = getDb();
    const limit = Number(c.req.query("limit") ?? 90);

    const entries = await db.query.weightEntries.findMany({
      where: eq(weightEntries.userId, userId),
      orderBy: [desc(weightEntries.date)],
      limit,
    });

    return c.json(entries.reverse());
  })

  .post("/weight", zValidator("json", weightSchema), async (c) => {
    const userId = getUserId(c);
    const data = c.req.valid("json");
    const db = getDb();

    const [entry] = await db
      .insert(weightEntries)
      .values({ userId, ...data })
      .returning();

    return c.json(entry, 201);
  })

  .get("/measurements", async (c) => {
    const userId = getUserId(c);
    const db = getDb();

    const measurements = await db.query.bodyMeasurements.findMany({
      where: eq(bodyMeasurements.userId, userId),
      orderBy: [desc(bodyMeasurements.date)],
    });

    return c.json(measurements);
  })

  .post("/measurements", zValidator("json", measurementSchema), async (c) => {
    const userId = getUserId(c);
    const data = c.req.valid("json");
    const db = getDb();

    const [measurement] = await db
      .insert(bodyMeasurements)
      .values({ userId, ...data })
      .returning();

    return c.json(measurement, 201);
  });
