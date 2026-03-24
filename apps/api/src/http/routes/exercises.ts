import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { exercises } from "@fitforge/db";
import { getDb } from "../../infrastructure/db.js";
import { authMiddleware } from "../middleware/auth.js";

export const MUSCLES = [
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

const createExerciseSchema = z.object({
  name: z.string().min(2).max(255),
  primaryMuscle: muscleSchema,
  secondaryMuscles: z.array(muscleSchema).default([]),
});

export const exerciseRoutes = new Hono()
  .use("*", authMiddleware)

  .get("/", async (c) => {
    const db = getDb();
    const search = c.req.query("search");
    const muscle = c.req.query("muscle");

    const results = await db.query.exercises.findMany({
      orderBy: (ex, { asc }) => [asc(ex.name)],
      limit: 200,
    });

    const filtered = search
      ? results.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
      : results;

    const muscleFiltered =
      muscle && muscleSchema.safeParse(muscle).success
        ? filtered.filter(
            (e) => e.primaryMuscle === muscle || (e.secondaryMuscles as string[]).includes(muscle),
          )
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
    const data = c.req.valid("json");
    const db = getDb();

    const [exercise] = await db.insert(exercises).values(data).returning();

    return c.json(exercise, 201);
  });
