import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { userProfiles, bodyGoals } from "@fitforge/db";
import { getDb } from "../../infrastructure/db.js";
import { authMiddleware, getUserId } from "../middleware/auth.js";

const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(100).optional(),
  dateOfBirth: z.string().date().optional().nullable(),
  gender: z.string().optional().nullable(),
  heightCm: z.number().positive().optional().nullable(),
  unitPreference: z.enum(["metric", "imperial"]).optional(),
  fitnessGoal: z.string().optional().nullable(),
  experienceLevel: z
    .enum(["beginner", "intermediate", "advanced"])
    .optional()
    .nullable(),
  injuries: z.string().optional().nullable(),
});

const createGoalSchema = z.object({
  type: z.string(),
  targetValue: z.number(),
  currentValue: z.number(),
  unit: z.string(),
  startDate: z.string().date(),
  targetDate: z.string().date().optional().nullable(),
});

export const profileRoutes = new Hono()
  .use("*", authMiddleware)

  .get("/", async (c) => {
    const userId = getUserId(c);
    const db = getDb();
    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
    });
    if (!profile) return c.json({ error: "Profile not found" }, 404);
    return c.json(profile);
  })

  .patch("/", zValidator("json", updateProfileSchema), async (c) => {
    const userId = getUserId(c);
    const updates = c.req.valid("json");
    const db = getDb();

    const [updated] = await db
      .update(userProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(userProfiles.userId, userId))
      .returning();

    return c.json(updated);
  })

  .get("/goals", async (c) => {
    const userId = getUserId(c);
    const db = getDb();
    const goals = await db.query.bodyGoals.findMany({
      where: eq(bodyGoals.userId, userId),
    });
    return c.json(goals);
  })

  .post("/goals", zValidator("json", createGoalSchema), async (c) => {
    const userId = getUserId(c);
    const data = c.req.valid("json");
    const db = getDb();

    const [goal] = await db
      .insert(bodyGoals)
      .values({ ...data, userId })
      .returning();

    return c.json(goal, 201);
  })

  .patch(
    "/goals/:id",
    zValidator(
      "json",
      z.object({
        currentValue: z.number().optional(),
        targetValue: z.number().optional(),
        targetDate: z.string().date().optional().nullable(),
        status: z.enum(["active", "completed", "cancelled"]).optional(),
      })
    ),
    async (c) => {
      const userId = getUserId(c);
      const { id } = c.req.param();
      const updates = c.req.valid("json");
      const db = getDb();

      const [updated] = await db
        .update(bodyGoals)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(bodyGoals.id, id))
        .returning();

      if (!updated) return c.json({ error: "Goal not found" }, 404);
      return c.json(updated);
    }
  );
