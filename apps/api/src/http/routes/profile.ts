import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { userProfiles } from "@fitforge/db";
import { getDb } from "../../infrastructure/db.js";
import { authMiddleware, getUserId } from "../middleware/auth.js";

const updateProfileSchema = z.object({
  displayName: z.string().min(2).max(100).optional(),
  dateOfBirth: z.string().date().optional().nullable(),
  gender: z.string().optional().nullable(),
  heightCm: z.number().positive().optional().nullable(),
  unitPreference: z.enum(["metric", "imperial"]).optional(),
  fitnessGoal: z.string().optional().nullable(),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]).optional().nullable(),
  injuries: z.string().optional().nullable(),
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
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, userId))
      .returning();

    return c.json(updated);
  });
