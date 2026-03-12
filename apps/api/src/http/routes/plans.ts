import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, ilike } from "drizzle-orm";
import {
  trainingPlans,
  planMicrocycles,
  planDays,
  workoutTemplates,
  templateExercises,
  exercises,
  cardioTemplates,
  cardioTemplateExercises,
} from "@fitforge/db";
import { getDb } from "../../infrastructure/db.js";
import { authMiddleware, getUserId } from "../middleware/auth.js";

// ─── AI import schema ─────────────────────────────────────────────────────────

const MUSCLES = [
  "chest",
  "upper_chest",
  "lower_chest",
  "back",
  "lats",
  "upper_back",
  "lower_back",
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
  primaryMuscle: muscleSchema,
  secondaryMuscles: z.array(muscleSchema).default([]),
  sets: z.number().int(),
  repMin: z.number().int(),
  repMax: z.number().int(),
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

const updatePlanSchema = createPlanSchema.partial();

const upsertDaySchema = z.object({
  type: z.enum(["training", "rest"]).default("training"),
  workoutTemplateId: z.string().uuid().nullable().optional(),
  cardioTemplateId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// ─── Helper: create a workout template from AI exercises ──────────────────────

async function createTemplateFromExercises(
  db: ReturnType<typeof getDb>,
  userId: string,
  name: string,
  exList: Array<{
    name: string;
    primaryMuscle?: string;
    secondaryMuscles?: string[];
    sets: number;
    repMin: number;
    repMax: number;
    restSeconds?: number;
  }>
): Promise<string | null> {
  if (exList.length === 0) return null;

  const [tmpl] = await db
    .insert(workoutTemplates)
    .values({ userId, name })
    .returning();

  let order = 1;
  for (const ex of exList) {
    // Try to find existing exercise by name; auto-create if not found
    let matched = await db.query.exercises.findFirst({
      where: ilike(exercises.name, ex.name),
    });

    if (!matched) {
      [matched] = await db
        .insert(exercises)
        .values({
          name: ex.name,
          primaryMuscle: (ex.primaryMuscle as any) ?? "other",
          secondaryMuscles: (ex.secondaryMuscles as any) ?? [],
        })
        .returning();
    }

    await db.insert(templateExercises).values({
      workoutTemplateId: tmpl.id,
      exerciseId: matched.id,
      order: order++,
      targetSets: ex.sets,
      targetRepMin: ex.repMin,
      targetRepMax: ex.repMax,
      restSeconds: ex.restSeconds ?? null,
    });
  }

  return tmpl.id;
}

// ─── Helper: create a cardio template from AI exercises ───────────────────────

async function createCardioTemplate(
  db: ReturnType<typeof getDb>,
  userId: string,
  name: string,
  exList: Array<{ name: string; zone?: number; kilometers?: number }>
): Promise<string> {
  const [tmpl] = await db
    .insert(cardioTemplates)
    .values({ userId, name })
    .returning();

  if (exList.length > 0) {
    await db.insert(cardioTemplateExercises).values(
      exList.map((ex, i) => ({
        cardioTemplateId: tmpl.id,
        name: ex.name,
        zone: ex.zone ?? null,
        kilometers: ex.kilometers != null ? String(ex.kilometers) : null,
        order: i + 1,
      }))
    );
  }

  return tmpl.id;
}

export const planRoutes = new Hono()
  .use("*", authMiddleware)

  // List all plans for user
  .get("/", async (c) => {
    const userId = getUserId(c);
    const db = getDb();
    const plans = await db.query.trainingPlans.findMany({
      where: eq(trainingPlans.userId, userId),
      orderBy: (tp, { desc }) => [desc(tp.updatedAt)],
    });
    return c.json(plans);
  })

  // Get single plan with full structure
  .get("/:id", async (c) => {
    const userId = getUserId(c);
    const { id } = c.req.param();
    const db = getDb();
    const plan = await db.query.trainingPlans.findFirst({
      where: and(eq(trainingPlans.id, id), eq(trainingPlans.userId, userId)),
      with: {
        microcycles: {
          orderBy: (pm, { asc }) => [asc(pm.position)],
          with: {
            days: {
              orderBy: (pd, { asc }) => [asc(pd.dayNumber)],
              with: {
                workoutTemplate: true,
                cardioTemplate: true,
              },
            },
          },
        },
      },
    });
    if (!plan) return c.json({ error: "Plan not found" }, 404);
    return c.json(plan);
  })

  // Create plan — auto-creates microcycles and empty day stubs
  .post("/", zValidator("json", createPlanSchema), async (c) => {
    const userId = getUserId(c);
    const data = c.req.valid("json");
    const db = getDb();

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

    const [updated] = await db
      .update(trainingPlans)
      .set({ ...data, updatedAt: new Date() })
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

    const nextPosition = (plan.microcycles.length > 0
      ? Math.max(...plan.microcycles.map((m) => m.position))
      : 0) + 1;

    const [mc] = await db
      .insert(planMicrocycles)
      .values({ trainingPlanId: id, position: nextPosition })
      .returning();

    const dayRows = Array.from({ length: plan.microcycleLength }, (_, i) => ({
      planMicrocycleId: mc.id,
      dayNumber: i + 1,
      type: "training" as const,
    }));
    if (dayRows.length > 0) await db.insert(planDays).values(dayRows);

    // Update mesocycleLength
    await db
      .update(trainingPlans)
      .set({ mesocycleLength: nextPosition, updatedAt: new Date() })
      .where(eq(trainingPlans.id, id));

    return c.json(mc, 201);
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

    const newDayNumber = plan.microcycleLength + 1;

    // Insert one new day stub per microcycle
    for (const mc of plan.microcycles) {
      await db.insert(planDays).values({
        planMicrocycleId: mc.id,
        dayNumber: newDayNumber,
        type: "training",
      });
    }

    const [updated] = await db
      .update(trainingPlans)
      .set({ microcycleLength: newDayNumber, updatedAt: new Date() })
      .where(eq(trainingPlans.id, id))
      .returning();

    return c.json(updated);
  })

  // Upsert a single day within a microcycle
  .put(
    "/:id/microcycles/:micId/days/:dayNum",
    zValidator("json", upsertDaySchema),
    async (c) => {
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
        where: and(
          eq(planDays.planMicrocycleId, micId),
          eq(planDays.dayNumber, dayNumber)
        ),
      });

      // Clear template IDs when day type is not training
      const payload = {
        ...data,
        workoutTemplateId:
          data.type === "training" ? (data.workoutTemplateId ?? null) : null,
        cardioTemplateId:
          data.type === "training" ? (data.cardioTemplateId ?? null) : null,
      };

      if (existing) {
        const [updated] = await db
          .update(planDays)
          .set(payload)
          .where(eq(planDays.id, existing.id))
          .returning();
        await db
          .update(trainingPlans)
          .set({ updatedAt: new Date() })
          .where(eq(trainingPlans.id, id));
        return c.json(updated);
      }

      const [created] = await db
        .insert(planDays)
        .values({ planMicrocycleId: micId, dayNumber, ...payload })
        .returning();
      await db
        .update(trainingPlans)
        .set({ updatedAt: new Date() })
        .where(eq(trainingPlans.id, id));
      return c.json(created, 201);
    }
  )

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
    if (plan.microcycles.length <= 1)
      return c.json({ error: "Cannot delete the only week" }, 400);

    const target = plan.microcycles.find((m) => m.id === micId);
    if (!target) return c.json({ error: "Week not found" }, 404);

    // Delete the microcycle (cascade deletes its days)
    await db
      .delete(planMicrocycles)
      .where(eq(planMicrocycles.id, micId));

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
    if (plan.microcycleLength <= 1)
      return c.json({ error: "Cannot delete the only day" }, 400);

    const lastDay = plan.microcycleLength;

    for (const mc of plan.microcycles) {
      await db
        .delete(planDays)
        .where(
          and(
            eq(planDays.planMicrocycleId, mc.id),
            eq(planDays.dayNumber, lastDay)
          )
        );
    }

    const [updated] = await db
      .update(trainingPlans)
      .set({ microcycleLength: lastDay - 1, updatedAt: new Date() })
      .where(eq(trainingPlans.id, id))
      .returning();

    return c.json(updated);
  })

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

    const microcycleLength = Math.max(
      ...data.weeks.flatMap((w) => w.days.map((d) => d.day)),
      1
    );
    const mesocycleLength = data.weeks.length;

    const [plan] = await db
      .insert(trainingPlans)
      .values({
        userId,
        name: data.name,
        description: data.description ?? null,
        microcycleLength,
        mesocycleLength,
      })
      .returning();

    for (const week of data.weeks) {
      const [mc] = await db
        .insert(planMicrocycles)
        .values({ trainingPlanId: plan.id, position: week.week })
        .returning();

      // Fill all day slots; days not specified by AI get empty training stubs
      for (let dayNum = 1; dayNum <= microcycleLength; dayNum++) {
        const day = week.days.find((d) => d.day === dayNum);

        if (!day) {
          await db.insert(planDays).values({
            planMicrocycleId: mc.id,
            dayNumber: dayNum,
            type: "training",
          });
          continue;
        }

        if (day.rest) {
          await db.insert(planDays).values({
            planMicrocycleId: mc.id,
            dayNumber: dayNum,
            type: "rest",
            notes: day.restNote ?? null,
          });
          continue;
        }

        const strengthTemplateId = day.workout
          ? await createTemplateFromExercises(
              db,
              userId,
              day.workout.name,
              day.workout.exercises
            )
          : null;

        const cardioTemplateId = day.cardio
          ? await createCardioTemplate(
              db,
              userId,
              day.cardio.name,
              day.cardio.exercises
            )
          : null;

        await db.insert(planDays).values({
          planMicrocycleId: mc.id,
          dayNumber: dayNum,
          type: "training",
          workoutTemplateId: strengthTemplateId,
          cardioTemplateId,
          notes: null,
        });
      }
    }

    return c.json({ id: plan.id }, 201);
  });
