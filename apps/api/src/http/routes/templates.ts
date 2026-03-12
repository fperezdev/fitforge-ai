import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { workoutTemplates, templateExercises } from "@fitforge/db";
import { getDb } from "../../infrastructure/db.js";
import { authMiddleware, getUserId } from "../middleware/auth.js";

const createTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  exercises: z
    .array(
      z.object({
        exerciseId: z.string().uuid(),
        order: z.number().int().min(1),
        targetSets: z.number().int().min(1),
        targetRepMin: z.number().int().min(1),
        targetRepMax: z.number().int().min(1),
        rir: z.number().int().min(0).optional().nullable(),
        restSeconds: z.number().int().optional().nullable(),
      })
    )
    .optional()
    .default([]),
});

export const templateRoutes = new Hono()
  .use("*", authMiddleware)

  .get("/", async (c) => {
    const userId = getUserId(c);
    const db = getDb();

    const templates = await db.query.workoutTemplates.findMany({
      where: eq(workoutTemplates.userId, userId),
      with: {
        templateExercises: {
          with: { exercise: true },
          orderBy: (te, { asc }) => [asc(te.order)],
        },
      },
      orderBy: (wt, { desc }) => [desc(wt.updatedAt)],
    });

    return c.json(templates);
  })

  .get("/:id", async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.param();
    const db = getDb();

    const template = await db.query.workoutTemplates.findFirst({
      where: and(
        eq(workoutTemplates.id, id),
        eq(workoutTemplates.userId, userId)
      ),
      with: {
        templateExercises: {
          with: { exercise: true },
          orderBy: (te, { asc }) => [asc(te.order)],
        },
      },
    });

    if (!template) return c.json({ error: "Template not found" }, 404);
    return c.json(template);
  })

  .post("/", zValidator("json", createTemplateSchema), async (c) => {
    const userId = getUserId(c);
    const { exercises: exs, ...data } = c.req.valid("json");
    const db = getDb();

    const [template] = await db
      .insert(workoutTemplates)
      .values({ ...data, userId })
      .returning();

    if (exs.length > 0) {
      await db
        .insert(templateExercises)
        .values(exs.map((e) => ({ ...e, workoutTemplateId: template.id })));
    }

    return c.json(template, 201);
  })

  .put("/:id", zValidator("json", createTemplateSchema), async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.param();
    const { exercises: exs, ...data } = c.req.valid("json");
    const db = getDb();

    const [updated] = await db
      .update(workoutTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(eq(workoutTemplates.id, id), eq(workoutTemplates.userId, userId))
      )
      .returning();

    if (!updated) return c.json({ error: "Template not found" }, 404);

    // Replace exercises
    await db
      .delete(templateExercises)
      .where(eq(templateExercises.workoutTemplateId, id));

    if (exs.length > 0) {
      await db
        .insert(templateExercises)
        .values(exs.map((e) => ({ ...e, workoutTemplateId: id })));
    }

    return c.json(updated);
  })

  .delete("/:id", async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.param();
    const db = getDb();

    await db
      .delete(workoutTemplates)
      .where(
        and(eq(workoutTemplates.id, id), eq(workoutTemplates.userId, userId))
      );

    return c.json({ success: true });
  });
