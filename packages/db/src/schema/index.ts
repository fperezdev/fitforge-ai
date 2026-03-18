import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  pgSchema,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql, ne } from "drizzle-orm";

export const muscleEnum = pgEnum("muscle", [
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
]);

// Reference to Supabase's auth schema
const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

// ─── User Profiles ──────────────────────────────────────────────────────────

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" })
    .unique(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  dateOfBirth: date("date_of_birth"),
  gender: varchar("gender", { length: 50 }),
  heightCm: numeric("height_cm").$type<number>(),
  unitPreference: varchar("unit_preference", { length: 10 }).notNull().default("metric"),
  fitnessGoal: varchar("fitness_goal", { length: 100 }),
  experienceLevel: varchar("experience_level", { length: 50 }),
  injuries: text("injuries"),
  equipment: text("equipment")
    .array()
    .notNull()
    .default(sql`'{full_gym}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Exercises ───────────────────────────────────────────────────────────────

export const exercises = pgTable("exercises", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  primaryMuscle: muscleEnum("primary_muscle").notNull().default("other"),
  secondaryMuscles: muscleEnum("secondary_muscles")
    .array()
    .notNull()
    .default(sql`'{}'::muscle[]`),
  requiredEquipment: text("required_equipment")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Workout Templates ────────────────────────────────────────────────────────

export const workoutTemplates = pgTable("workout_templates", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const templateExercises = pgTable("template_exercises", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  workoutTemplateId: uuid("workout_template_id")
    .notNull()
    .references(() => workoutTemplates.id, { onDelete: "cascade" }),
  exerciseId: uuid("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "cascade" }),
  order: integer("order").notNull(),
  targetSets: integer("target_sets").notNull(),
  targetRepMin: integer("target_rep_min").notNull(),
  targetRepMax: integer("target_rep_max").notNull(),
  rir: integer("rir"),
  restSeconds: integer("rest_seconds"),
});

// ─── Workout Sessions ─────────────────────────────────────────────────────────

export const workoutSessions = pgTable("workout_sessions", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }),
  status: varchar("status", { length: 50 }).notNull(), // 'in_progress' | 'completed' | 'cancelled'
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  notes: text("notes"),
  // Plan linkage (set when session is started from a plan suggestion)
  planDayId: uuid("plan_day_id"),
  weekIndex: integer("week_index"),
  dayIndex: integer("day_index"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exerciseEntries = pgTable("exercise_entries", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  workoutSessionId: uuid("workout_session_id")
    .notNull()
    .references(() => workoutSessions.id, { onDelete: "cascade" }),
  exerciseId: uuid("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "cascade" }),
  order: integer("order").notNull(),
  targetRepMin: integer("target_rep_min"),
  targetRepMax: integer("target_rep_max"),
  targetRir: integer("target_rir"),
  restSeconds: integer("rest_seconds"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exerciseSets = pgTable("exercise_sets", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  exerciseEntryId: uuid("exercise_entry_id")
    .notNull()
    .references(() => exerciseEntries.id, { onDelete: "cascade" }),
  setNumber: integer("set_number").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'working' | 'warmup' | 'dropset' | 'failure'
  weightKg: numeric("weight_kg").$type<number>(),
  reps: integer("reps"),
  rir: integer("rir"),
  durationSeconds: integer("duration_seconds"),
  restSeconds: integer("rest_seconds"),
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Personal Records ─────────────────────────────────────────────────────────

export const personalRecords = pgTable("personal_records", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  exerciseId: uuid("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(), // 'max_weight' | 'max_reps' | 'estimated_1rm'
  value: numeric("value").$type<number>().notNull(),
  workoutSessionId: uuid("workout_session_id")
    .notNull()
    .references(() => workoutSessions.id, { onDelete: "cascade" }),
  previousValue: numeric("previous_value").$type<number>(),
  achievedAt: timestamp("achieved_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Cardio ───────────────────────────────────────────────────────────────────

export const cardioSessions = pgTable("cardio_sessions", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(), // 'run' | 'walk' | 'bike' | 'swim' | etc.
  status: varchar("status", { length: 50 }).notNull(), // 'in_progress' | 'completed' | 'cancelled'
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  distanceMeters: integer("distance_meters"),
  durationSeconds: integer("duration_seconds"),
  avgPaceSecondsPerKm: integer("avg_pace_seconds_per_km"),
  avgHeartRate: integer("avg_heart_rate"),
  maxHeartRate: integer("max_heart_rate"),
  caloriesBurned: integer("calories_burned"),
  elevationGainMeters: integer("elevation_gain_meters"),
  notes: text("notes"),
  // Plan linkage (mirrors workout_sessions)
  planDayId: uuid("plan_day_id"),
  weekIndex: integer("week_index"),
  dayIndex: integer("day_index"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cardioSplits = pgTable("cardio_splits", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  cardioSessionId: uuid("cardio_session_id")
    .notNull()
    .references(() => cardioSessions.id, { onDelete: "cascade" }),
  kilometer: integer("kilometer").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  paceSecondsPerKm: integer("pace_seconds_per_km").notNull(),
});

// ─── Body Tracking ────────────────────────────────────────────────────────────

export const weightEntries = pgTable("weight_entries", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  weightKg: numeric("weight_kg").$type<number>().notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bodyMeasurements = pgTable("body_measurements", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  bodyFatPercent: numeric("body_fat_percent").$type<number>(),
  chestCm: numeric("chest_cm").$type<number>(),
  waistCm: numeric("waist_cm").$type<number>(),
  hipsCm: numeric("hips_cm").$type<number>(),
  bicepLeftCm: numeric("bicep_left_cm").$type<number>(),
  bicepRightCm: numeric("bicep_right_cm").$type<number>(),
  thighLeftCm: numeric("thigh_left_cm").$type<number>(),
  thighRightCm: numeric("thigh_right_cm").$type<number>(),
  calfLeftCm: numeric("calf_left_cm").$type<number>(),
  calfRightCm: numeric("calf_right_cm").$type<number>(),
  shouldersCm: numeric("shoulders_cm").$type<number>(),
  neckCm: numeric("neck_cm").$type<number>(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── AI Coach ─────────────────────────────────────────────────────────────────

export const coachConversations = pgTable("coach_conversations", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }),
  mode: varchar("mode", { length: 20 }), // 'advice' | 'plan'
  status: varchar("status", { length: 20 }).notNull().default("active"), // 'active' | 'closed'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const coachRequests = pgTable("coach_requests", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => coachConversations.id, { onDelete: "cascade" }),
  userMessage: text("user_message").notNull(),
  status: varchar("status", { length: 50 }).notNull(), // 'pending' | 'processing' | 'completed' | 'failed'
  response: text("response"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const coachMessages = pgTable("coach_messages", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => coachConversations.id, { onDelete: "cascade" }),
  coachRequestId: uuid("coach_request_id").references(() => coachRequests.id, {
    onDelete: "set null",
  }),
  role: varchar("role", { length: 20 }).notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Cardio Templates ─────────────────────────────────────────────────────────

export const cardioTemplates = pgTable("cardio_templates", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cardioTemplateExercises = pgTable("cardio_template_exercises", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  cardioTemplateId: uuid("cardio_template_id")
    .notNull()
    .references(() => cardioTemplates.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  zone: integer("zone"),
  kilometers: numeric("kilometers").$type<number>(),
  order: integer("order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Training Plans ───────────────────────────────────────────────────────────

export const trainingPlans = pgTable(
  "training_plans",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 50 }).notNull().default("draft"), // 'draft' | 'active' | 'completed'
    microcycleLength: integer("microcycle_length").notNull().default(7),
    mesocycleLength: integer("mesocycle_length").notNull().default(4),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    startDate: date("start_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // At most one non-completed plan per user (draft or active)
    activeUnique: uniqueIndex("training_plans_user_id_active_unique")
      .on(t.userId)
      .where(ne(t.status, "completed")),
  }),
);

export const planMicrocycles = pgTable("plan_microcycles", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  trainingPlanId: uuid("training_plan_id")
    .notNull()
    .references(() => trainingPlans.id, { onDelete: "cascade" }),
  position: integer("position").notNull(), // 1-based index
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const planDays = pgTable("plan_days", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  planMicrocycleId: uuid("plan_microcycle_id")
    .notNull()
    .references(() => planMicrocycles.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(), // 1-based, within microcycle
  type: varchar("type", { length: 50 }).notNull().default("training"), // 'training' | 'rest'
  workoutTemplateId: uuid("workout_template_id").references(() => workoutTemplates.id, {
    onDelete: "set null",
  }),
  cardioTemplateId: uuid("cardio_template_id").references(() => cardioTemplates.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
});

// ─── Plan Day Logs ────────────────────────────────────────────────────────────
// One row per plan-day occurrence (calendar slot). Tracks completed / skipped.

export const planDayLogs = pgTable("plan_day_logs", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  trainingPlanId: uuid("training_plan_id")
    .notNull()
    .references(() => trainingPlans.id, { onDelete: "cascade" }),
  planDayId: uuid("plan_day_id")
    .notNull()
    .references(() => planDays.id, { onDelete: "cascade" }),
  weekIndex: integer("week_index").notNull(), // 0-based microcycle occurrence
  dayIndex: integer("day_index").notNull(), // 0-based day within microcycle
  // 'completed' | 'skipped'                  — full-day log (legacy / rest days)
  // 'workout_completed' | 'workout_skipped'  — strength component only
  // 'cardio_completed'  | 'cardio_skipped'   — cardio component only
  status: varchar("status", { length: 50 }).notNull(),
  workoutSessionId: uuid("workout_session_id").references(() => workoutSessions.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const workoutTemplatesRelations = relations(workoutTemplates, ({ many }) => ({
  templateExercises: many(templateExercises),
  planDaysStrength: many(planDays, { relationName: "strengthTemplate" }),
}));

export const templateExercisesRelations = relations(templateExercises, ({ one }) => ({
  workoutTemplate: one(workoutTemplates, {
    fields: [templateExercises.workoutTemplateId],
    references: [workoutTemplates.id],
  }),
  exercise: one(exercises, {
    fields: [templateExercises.exerciseId],
    references: [exercises.id],
  }),
}));

export const workoutSessionsRelations = relations(workoutSessions, ({ many }) => ({
  exerciseEntries: many(exerciseEntries),
  personalRecords: many(personalRecords),
  planDayLogs: many(planDayLogs),
}));

export const exerciseEntriesRelations = relations(exerciseEntries, ({ one, many }) => ({
  workoutSession: one(workoutSessions, {
    fields: [exerciseEntries.workoutSessionId],
    references: [workoutSessions.id],
  }),
  exercise: one(exercises, {
    fields: [exerciseEntries.exerciseId],
    references: [exercises.id],
  }),
  sets: many(exerciseSets),
}));

export const exerciseSetsRelations = relations(exerciseSets, ({ one }) => ({
  exerciseEntry: one(exerciseEntries, {
    fields: [exerciseSets.exerciseEntryId],
    references: [exerciseEntries.id],
  }),
}));

export const personalRecordsRelations = relations(personalRecords, ({ one }) => ({
  exercise: one(exercises, {
    fields: [personalRecords.exerciseId],
    references: [exercises.id],
  }),
  workoutSession: one(workoutSessions, {
    fields: [personalRecords.workoutSessionId],
    references: [workoutSessions.id],
  }),
}));

export const cardioSessionsRelations = relations(cardioSessions, ({ many }) => ({
  splits: many(cardioSplits),
}));

export const cardioSplitsRelations = relations(cardioSplits, ({ one }) => ({
  cardioSession: one(cardioSessions, {
    fields: [cardioSplits.cardioSessionId],
    references: [cardioSessions.id],
  }),
}));

export const coachConversationsRelations = relations(coachConversations, ({ many }) => ({
  messages: many(coachMessages),
  requests: many(coachRequests),
}));

export const coachRequestsRelations = relations(coachRequests, ({ one }) => ({
  conversation: one(coachConversations, {
    fields: [coachRequests.conversationId],
    references: [coachConversations.id],
  }),
}));

export const coachMessagesRelations = relations(coachMessages, ({ one }) => ({
  conversation: one(coachConversations, {
    fields: [coachMessages.conversationId],
    references: [coachConversations.id],
  }),
  coachRequest: one(coachRequests, {
    fields: [coachMessages.coachRequestId],
    references: [coachRequests.id],
  }),
}));

export const cardioTemplatesRelations = relations(cardioTemplates, ({ many }) => ({
  cardioTemplateExercises: many(cardioTemplateExercises),
  planDays: many(planDays),
}));

export const cardioTemplateExercisesRelations = relations(cardioTemplateExercises, ({ one }) => ({
  cardioTemplate: one(cardioTemplates, {
    fields: [cardioTemplateExercises.cardioTemplateId],
    references: [cardioTemplates.id],
  }),
}));

export const trainingPlansRelations = relations(trainingPlans, ({ many }) => ({
  microcycles: many(planMicrocycles),
}));

export const planMicrocyclesRelations = relations(planMicrocycles, ({ one, many }) => ({
  trainingPlan: one(trainingPlans, {
    fields: [planMicrocycles.trainingPlanId],
    references: [trainingPlans.id],
  }),
  days: many(planDays),
}));

export const planDaysRelations = relations(planDays, ({ one }) => ({
  microcycle: one(planMicrocycles, {
    fields: [planDays.planMicrocycleId],
    references: [planMicrocycles.id],
  }),
  workoutTemplate: one(workoutTemplates, {
    fields: [planDays.workoutTemplateId],
    references: [workoutTemplates.id],
    relationName: "strengthTemplate",
  }),
  cardioTemplate: one(cardioTemplates, {
    fields: [planDays.cardioTemplateId],
    references: [cardioTemplates.id],
  }),
}));

export const planDayLogsRelations = relations(planDayLogs, ({ one }) => ({
  trainingPlan: one(trainingPlans, {
    fields: [planDayLogs.trainingPlanId],
    references: [trainingPlans.id],
  }),
  planDay: one(planDays, {
    fields: [planDayLogs.planDayId],
    references: [planDays.id],
  }),
  workoutSession: one(workoutSessions, {
    fields: [planDayLogs.workoutSessionId],
    references: [workoutSessions.id],
  }),
}));
