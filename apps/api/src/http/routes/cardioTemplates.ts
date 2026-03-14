import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { cardioTemplates, cardioTemplateExercises } from "@fitforge/db";
import { getDb } from "../../infrastructure/db.js";
import { authMiddleware, getUserId } from "../middleware/auth.js";

const exerciseSchema = z.object({
  name: z.string().min(1).max(255),
  zone: z.number().int().min(1).max(5).optional().nullable(),
  kilometers: z.number().optional().nullable(),
  order: z.number().int().min(1),
});

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  exercises: z.array(exerciseSchema).optional().default([]),
});

export const cardioTemplateRoutes = new Hono()
  .use("*", authMiddleware)

  .get("/", async (c) => {
    const userId = getUserId(c);
    const db = getDb();

    const templates = await db.query.cardioTemplates.findMany({
      where: eq(cardioTemplates.userId, userId),
      with: {
        cardioTemplateExercises: {
          orderBy: (cte, { asc }) => [asc(cte.order)],
        },
      },
      orderBy: (ct, { desc }) => [desc(ct.updatedAt)],
    });

    return c.json(templates);
  })

  .get("/:id", async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.param();
    const db = getDb();

    const template = await db.query.cardioTemplates.findFirst({
      where: and(eq(cardioTemplates.id, id), eq(cardioTemplates.userId, userId)),
      with: {
        cardioTemplateExercises: {
          orderBy: (cte, { asc }) => [asc(cte.order)],
        },
      },
    });

    if (!template) return c.json({ error: "Template not found" }, 404);
    return c.json(template);
  })

  .post("/", zValidator("json", createSchema), async (c) => {
    const userId = getUserId(c);
    const { exercises: exs, ...data } = c.req.valid("json");
    const db = getDb();

    const [template] = await db
      .insert(cardioTemplates)
      .values({ ...data, userId })
      .returning();

    if (exs.length > 0) {
      await db.insert(cardioTemplateExercises).values(
        exs.map((e) => ({
          ...e,
          kilometers: e.kilometers ?? null,
          cardioTemplateId: template.id,
        }))
      );
    }

    return c.json(template, 201);
  })

  .put("/:id", zValidator("json", createSchema), async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.param();
    const { exercises: exs, ...data } = c.req.valid("json");
    const db = getDb();

    const [updated] = await db
      .update(cardioTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(cardioTemplates.id, id), eq(cardioTemplates.userId, userId)))
      .returning();

    if (!updated) return c.json({ error: "Template not found" }, 404);

    await db
      .delete(cardioTemplateExercises)
      .where(eq(cardioTemplateExercises.cardioTemplateId, id));

    if (exs.length > 0) {
      await db.insert(cardioTemplateExercises).values(
        exs.map((e) => ({
          ...e,
          kilometers: e.kilometers ?? null,
          cardioTemplateId: id,
        }))
      );
    }

    return c.json(updated);
  })

  .delete("/:id", async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.param();
    const db = getDb();

    await db
      .delete(cardioTemplates)
      .where(and(eq(cardioTemplates.id, id), eq(cardioTemplates.userId, userId)));

    return c.json({ success: true });
  });
