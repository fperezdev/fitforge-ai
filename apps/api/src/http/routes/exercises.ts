import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, or, ilike, and } from "drizzle-orm";
import { exercises } from "@fitforge/db";
import { getDb } from "../../infrastructure/db.js";
import { authMiddleware, getUserId } from "../middleware/auth.js";

const createExerciseSchema = z.object({
  name: z.string().min(2).max(255),
  category: z.string(),
  primaryMuscles: z.array(z.string()).default([]),
  secondaryMuscles: z.array(z.string()).default([]),
  equipment: z.string(),
  instructions: z.string().optional().nullable(),
});

export const exerciseRoutes = new Hono()
  .use("*", authMiddleware)

  .get("/", async (c) => {
    const userId = getUserId(c);
    const db = getDb();
    const search = c.req.query("search");
    const category = c.req.query("category");
    const muscle = c.req.query("muscle");

    const conditions = [
      or(eq(exercises.isCustom, false), eq(exercises.createdBy, userId)),
    ];

    if (category) {
      conditions.push(eq(exercises.category, category));
    }

    const results = await db.query.exercises.findMany({
      where: and(...(conditions as any[])),
      orderBy: (ex, { asc }) => [asc(ex.name)],
      limit: 100,
    });

    const filtered = search
      ? results.filter((e) =>
          e.name.toLowerCase().includes(search.toLowerCase())
        )
      : results;

    const muscleFiltered = muscle
      ? filtered.filter((e) => e.primaryMuscles?.includes(muscle))
      : filtered;

    return c.json(muscleFiltered);
  })

  .get("/:id", async (c) => {
    const { id } = c.req.param();
    const db = getDb();
    const exercise = await db.query.exercises.findFirst({
      where: eq(exercises.id, id),
    });
    if (!exercise) return c.json({ error: "Exercise not found" }, 404);
    return c.json(exercise);
  })

  .post("/", zValidator("json", createExerciseSchema), async (c) => {
    const userId = getUserId(c);
    const data = c.req.valid("json");
    const db = getDb();

    const [exercise] = await db
      .insert(exercises)
      .values({ ...data, isCustom: true, createdBy: userId })
      .returning();

    return c.json(exercise, 201);
  });
