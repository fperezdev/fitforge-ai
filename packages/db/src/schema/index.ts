import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  jsonb,
  pgSchema,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// Reference to Supabase's auth schema
const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

// ─── User Profiles ──────────────────────────────────────────────────────────

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" })
    .unique(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  dateOfBirth: date("date_of_birth"),
  gender: varchar("gender", { length: 50 }),
  heightCm: numeric("height_cm"),
  unitPreference: varchar("unit_preference", { length: 10 })
    .notNull()
    .default("metric"),
  fitnessGoal: varchar("fitness_goal", { length: 100 }),
  experienceLevel: varchar("experience_level", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Exercises ───────────────────────────────────────────────────────────────

export const exercises = pgTable("exercises", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  primaryMuscles: text("primary_muscles").array(),
  secondaryMuscles: text("secondary_muscles").array(),
  equipment: varchar("equipment", { length: 100 }).notNull(),
  isCustom: boolean("is_custom").notNull().default(false),
  createdBy: uuid("created_by").references(() => authUsers.id, {
    onDelete: "set null",
  }),
  instructions: text("instructions"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Workout Templates ────────────────────────────────────────────────────────

export const workoutTemplates = pgTable("workout_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const templateExercises = pgTable("template_exercises", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
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
  restSeconds: integer("rest_seconds"),
});

// ─── Workout Sessions ─────────────────────────────────────────────────────────

export const workoutSessions = pgTable("workout_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }),
  status: varchar("status", { length: 50 }).notNull(), // 'in_progress' | 'completed' | 'cancelled'
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const exerciseEntries = pgTable("exercise_entries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workoutSessionId: uuid("workout_session_id")
    .notNull()
    .references(() => workoutSessions.id, { onDelete: "cascade" }),
  exerciseId: uuid("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "cascade" }),
  order: integer("order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const exerciseSets = pgTable("exercise_sets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  exerciseEntryId: uuid("exercise_entry_id")
    .notNull()
    .references(() => exerciseEntries.id, { onDelete: "cascade" }),
  setNumber: integer("set_number").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'working' | 'warmup' | 'dropset' | 'failure'
  weightKg: numeric("weight_kg"),
  reps: integer("reps"),
  rpe: numeric("rpe"),
  rir: integer("rir"),
  durationSeconds: integer("duration_seconds"),
  restSeconds: integer("rest_seconds"),
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Personal Records ─────────────────────────────────────────────────────────

export const personalRecords = pgTable("personal_records", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  exerciseId: uuid("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(), // 'max_weight' | 'max_reps' | 'estimated_1rm'
  value: numeric("value").notNull(),
  workoutSessionId: uuid("workout_session_id")
    .notNull()
    .references(() => workoutSessions.id, { onDelete: "cascade" }),
  previousValue: numeric("previous_value"),
  achievedAt: timestamp("achieved_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Cardio ───────────────────────────────────────────────────────────────────

export const cardioSessions = pgTable("cardio_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const cardioSplits = pgTable("cardio_splits", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  cardioSessionId: uuid("cardio_session_id")
    .notNull()
    .references(() => cardioSessions.id, { onDelete: "cascade" }),
  kilometer: integer("kilometer").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  paceSecondsPerKm: integer("pace_seconds_per_km").notNull(),
});

export const cardioRoutePoints = pgTable("cardio_route_points", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  cardioSessionId: uuid("cardio_session_id")
    .notNull()
    .references(() => cardioSessions.id, { onDelete: "cascade" }),
  latitude: numeric("latitude").notNull(),
  longitude: numeric("longitude").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
});

// ─── Body Tracking ────────────────────────────────────────────────────────────

export const weightEntries = pgTable("weight_entries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  weightKg: numeric("weight_kg").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const bodyMeasurements = pgTable("body_measurements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  bodyFatPercent: numeric("body_fat_percent"),
  chestCm: numeric("chest_cm"),
  waistCm: numeric("waist_cm"),
  hipsCm: numeric("hips_cm"),
  bicepLeftCm: numeric("bicep_left_cm"),
  bicepRightCm: numeric("bicep_right_cm"),
  thighLeftCm: numeric("thigh_left_cm"),
  thighRightCm: numeric("thigh_right_cm"),
  calfLeftCm: numeric("calf_left_cm"),
  calfRightCm: numeric("calf_right_cm"),
  shouldersCm: numeric("shoulders_cm"),
  neckCm: numeric("neck_cm"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const bodyGoals = pgTable("body_goals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 100 }).notNull(),
  targetValue: numeric("target_value").notNull(),
  currentValue: numeric("current_value").notNull(),
  unit: varchar("unit", { length: 50 }).notNull(),
  startDate: date("start_date").notNull(),
  targetDate: date("target_date"),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const progressPhotos = pgTable("progress_photos", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  fileUrl: varchar("file_url", { length: 1024 }).notNull(),
  pose: varchar("pose", { length: 100 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── AI Coach ─────────────────────────────────────────────────────────────────

export const coachConversations = pgTable("coach_conversations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const coachRequests = pgTable("coach_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => coachConversations.id, { onDelete: "cascade" }),
  userMessage: text("user_message").notNull(),
  status: varchar("status", { length: 50 }).notNull(), // 'pending' | 'processing' | 'completed' | 'failed'
  response: text("response"),
  tokensGenerated: integer("tokens_generated"),
  contextSnapshot: jsonb("context_snapshot"),
  error: text("error"),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const coachMessages = pgTable("coach_messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => coachConversations.id, { onDelete: "cascade" }),
  coachRequestId: uuid("coach_request_id").references(
    () => coachRequests.id,
    { onDelete: "set null" }
  ),
  role: varchar("role", { length: 20 }).notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const workoutTemplatesRelations = relations(
  workoutTemplates,
  ({ many }) => ({
    templateExercises: many(templateExercises),
  })
);

export const templateExercisesRelations = relations(
  templateExercises,
  ({ one }) => ({
    workoutTemplate: one(workoutTemplates, {
      fields: [templateExercises.workoutTemplateId],
      references: [workoutTemplates.id],
    }),
    exercise: one(exercises, {
      fields: [templateExercises.exerciseId],
      references: [exercises.id],
    }),
  })
);

export const workoutSessionsRelations = relations(
  workoutSessions,
  ({ many }) => ({
    exerciseEntries: many(exerciseEntries),
    personalRecords: many(personalRecords),
  })
);

export const exerciseEntriesRelations = relations(
  exerciseEntries,
  ({ one, many }) => ({
    workoutSession: one(workoutSessions, {
      fields: [exerciseEntries.workoutSessionId],
      references: [workoutSessions.id],
    }),
    exercise: one(exercises, {
      fields: [exerciseEntries.exerciseId],
      references: [exercises.id],
    }),
    sets: many(exerciseSets),
  })
);

export const exerciseSetsRelations = relations(exerciseSets, ({ one }) => ({
  exerciseEntry: one(exerciseEntries, {
    fields: [exerciseSets.exerciseEntryId],
    references: [exerciseEntries.id],
  }),
}));

export const personalRecordsRelations = relations(
  personalRecords,
  ({ one }) => ({
    exercise: one(exercises, {
      fields: [personalRecords.exerciseId],
      references: [exercises.id],
    }),
    workoutSession: one(workoutSessions, {
      fields: [personalRecords.workoutSessionId],
      references: [workoutSessions.id],
    }),
  })
);

export const cardioSessionsRelations = relations(
  cardioSessions,
  ({ many }) => ({
    splits: many(cardioSplits),
    routePoints: many(cardioRoutePoints),
  })
);

export const cardioSplitsRelations = relations(cardioSplits, ({ one }) => ({
  cardioSession: one(cardioSessions, {
    fields: [cardioSplits.cardioSessionId],
    references: [cardioSessions.id],
  }),
}));

export const cardioRoutePointsRelations = relations(
  cardioRoutePoints,
  ({ one }) => ({
    cardioSession: one(cardioSessions, {
      fields: [cardioRoutePoints.cardioSessionId],
      references: [cardioSessions.id],
    }),
  })
);

export const coachConversationsRelations = relations(
  coachConversations,
  ({ many }) => ({
    messages: many(coachMessages),
    requests: many(coachRequests),
  })
);

export const coachRequestsRelations = relations(
  coachRequests,
  ({ one }) => ({
    conversation: one(coachConversations, {
      fields: [coachRequests.conversationId],
      references: [coachConversations.id],
    }),
  })
);

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
