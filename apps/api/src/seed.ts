/**
 * Seed script — populates the database with:
 *   1. A test user (auth + profile)
 *   2. All exercises (shared / global)
 *
 * Usage (from apps/api):
 *   pnpm seed
 *
 * Requires a valid .env file with SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL.
 * Safe to re-run: existing exercises with the same name are skipped (ON CONFLICT DO NOTHING).
 * The test user is only created if it does not already exist in auth.users.
 */

import { createClient } from "@supabase/supabase-js";
import { createDb, exercises, userProfiles } from "@fitforge/db";
import { eq, notInArray } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Config — read from environment (loaded via --env-file flag in the npm script)
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;
const DATABASE_URL = process.env.DATABASE_URL!;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !DATABASE_URL) {
  console.error("Missing required env vars: SUPABASE_URL, SUPABASE_SECRET_KEY, DATABASE_URL");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Test user
// ---------------------------------------------------------------------------

const TEST_USER = {
  email: "test@fitforge.dev",
  password: "Test1234!",
  displayName: "Test User",
};

// ---------------------------------------------------------------------------
// Exercises seed data
// ---------------------------------------------------------------------------

type MuscleValue =
  | "chest"
  | "back"
  | "lats"
  | "traps"
  | "anterior_deltoids"
  | "lateral_deltoids"
  | "posterior_deltoids"
  | "biceps"
  | "triceps"
  | "forearms"
  | "core"
  | "obliques"
  | "glutes"
  | "quadriceps"
  | "hamstrings"
  | "calves"
  | "soleus"
  | "hip_flexors"
  | "adductors"
  | "full_body"
  | "other";

interface ExerciseSeed {
  name: string;
  primaryMuscle: MuscleValue;
  secondaryMuscles: MuscleValue[];
  requiredEquipment: string[];
}

const EXERCISES: ExerciseSeed[] = [
  // ── Chest ────────────────────────────────────────────────────────────────
  {
    name: "Bench Press (Barbell)",
    primaryMuscle: "chest",
    secondaryMuscles: ["anterior_deltoids", "triceps"],
    requiredEquipment: ["barbell", "rack"],
  },
  {
    name: "Bench Press (Dumbbell)",
    primaryMuscle: "chest",
    secondaryMuscles: ["anterior_deltoids", "triceps"],
    requiredEquipment: ["dumbbells"],
  },
  {
    name: "Incline Press (Barbell)",
    primaryMuscle: "chest",
    secondaryMuscles: ["anterior_deltoids", "triceps"],
    requiredEquipment: ["barbell", "rack"],
  },
  {
    name: "Incline Press (Dumbbell)",
    primaryMuscle: "chest",
    secondaryMuscles: ["anterior_deltoids", "triceps"],
    requiredEquipment: ["dumbbells"],
  },
  {
    name: "Chest Fly (Cable)",
    primaryMuscle: "chest",
    secondaryMuscles: ["anterior_deltoids"],
    requiredEquipment: ["cables"],
  },
  {
    name: "Dips (Assisted)",
    primaryMuscle: "chest",
    secondaryMuscles: ["triceps", "anterior_deltoids"],
    requiredEquipment: ["dip_bars"],
  },
  {
    name: "Chest Dip",
    primaryMuscle: "chest",
    secondaryMuscles: ["triceps", "anterior_deltoids"],
    requiredEquipment: ["dip_bars"],
  },
  {
    name: "Push-Up",
    primaryMuscle: "chest",
    secondaryMuscles: ["anterior_deltoids", "triceps", "core"],
    requiredEquipment: [],
  },
  {
    name: "Chest Press (Machine)",
    primaryMuscle: "chest",
    secondaryMuscles: ["anterior_deltoids", "triceps"],
    requiredEquipment: ["chest_press_machine"],
  },
  {
    name: "Pec Deck",
    primaryMuscle: "chest",
    secondaryMuscles: [],
    requiredEquipment: ["pec_deck_machine"],
  },

  // ── Back ─────────────────────────────────────────────────────────────────
  {
    name: "Pull-Up",
    primaryMuscle: "lats",
    secondaryMuscles: ["biceps", "back"],
    requiredEquipment: ["pullup_bar"],
  },
  {
    name: "Pull-Up (Assisted)",
    primaryMuscle: "lats",
    secondaryMuscles: ["biceps"],
    requiredEquipment: ["pullup_bar", "lat_pulldown_machine"],
  },
  {
    name: "Row (Barbell)",
    primaryMuscle: "back",
    secondaryMuscles: ["lats", "biceps", "traps"],
    requiredEquipment: ["barbell"],
  },
  {
    name: "Row (Dumbbell, Unilateral)",
    primaryMuscle: "lats",
    secondaryMuscles: ["biceps", "posterior_deltoids", "core"],
    requiredEquipment: ["dumbbells"],
  },
  {
    name: "Lat Pulldown (Close Grip)",
    primaryMuscle: "lats",
    secondaryMuscles: ["biceps"],
    requiredEquipment: ["lat_pulldown_machine"],
  },
  {
    name: "Lat Pulldown (Wide Grip)",
    primaryMuscle: "lats",
    secondaryMuscles: ["biceps", "back"],
    requiredEquipment: ["lat_pulldown_machine"],
  },
  {
    name: "Row (Cable, Neutral Grip)",
    primaryMuscle: "lats",
    secondaryMuscles: ["biceps", "traps"],
    requiredEquipment: ["cables", "seated_row_machine"],
  },
  {
    name: "Row (Cable, Wide Grip)",
    primaryMuscle: "lats",
    secondaryMuscles: ["biceps", "back"],
    requiredEquipment: ["cables", "seated_row_machine"],
  },
  {
    name: "Deadlift",
    primaryMuscle: "back",
    secondaryMuscles: ["glutes", "hamstrings", "traps", "core"],
    requiredEquipment: ["barbell"],
  },
  {
    name: "Shrug (Dumbbell)",
    primaryMuscle: "traps",
    secondaryMuscles: [],
    requiredEquipment: ["dumbbells"],
  },
  {
    name: "Shrug (Barbell)",
    primaryMuscle: "traps",
    secondaryMuscles: [],
    requiredEquipment: ["barbell"],
  },

  // ── Shoulders ────────────────────────────────────────────────────────────
  {
    name: "Overhead Press (Barbell)",
    primaryMuscle: "anterior_deltoids",
    secondaryMuscles: ["lateral_deltoids", "triceps", "core"],
    requiredEquipment: ["barbell"],
  },
  {
    name: "Overhead Press (Dumbbell)",
    primaryMuscle: "anterior_deltoids",
    secondaryMuscles: ["lateral_deltoids", "triceps"],
    requiredEquipment: ["dumbbells"],
  },
  {
    name: "Lateral Raise (Dumbbell)",
    primaryMuscle: "lateral_deltoids",
    secondaryMuscles: [],
    requiredEquipment: ["dumbbells"],
  },
  {
    name: "Lateral Raise (Cable)",
    primaryMuscle: "lateral_deltoids",
    secondaryMuscles: [],
    requiredEquipment: ["cables"],
  },
  {
    name: "Front Raise (Dumbbell)",
    primaryMuscle: "anterior_deltoids",
    secondaryMuscles: [],
    requiredEquipment: ["dumbbells"],
  },
  {
    name: "Face Pull",
    primaryMuscle: "posterior_deltoids",
    secondaryMuscles: ["traps", "back"],
    requiredEquipment: ["cables"],
  },
  {
    name: "Reverse Pec Deck",
    primaryMuscle: "posterior_deltoids",
    secondaryMuscles: ["back"],
    requiredEquipment: ["pec_deck_machine"],
  },

  // ── Arms ─────────────────────────────────────────────────────────────────
  {
    name: "Bicep Curl (Barbell)",
    primaryMuscle: "biceps",
    secondaryMuscles: ["forearms"],
    requiredEquipment: ["barbell"],
  },
  {
    name: "Bicep Curl (EZ-Bar)",
    primaryMuscle: "biceps",
    secondaryMuscles: ["forearms"],
    requiredEquipment: ["ez_bar"],
  },
  {
    name: "Bicep Curl (Dumbbell)",
    primaryMuscle: "biceps",
    secondaryMuscles: ["forearms"],
    requiredEquipment: ["dumbbells"],
  },
  {
    name: "Hammer Curl (Dumbbell)",
    primaryMuscle: "biceps",
    secondaryMuscles: ["forearms"],
    requiredEquipment: ["dumbbells"],
  },
  {
    name: "Bicep Curl (Cable)",
    primaryMuscle: "biceps",
    secondaryMuscles: [],
    requiredEquipment: ["cables"],
  },
  {
    name: "Tricep Pushdown (Cable)",
    primaryMuscle: "triceps",
    secondaryMuscles: [],
    requiredEquipment: ["cables"],
  },
  {
    name: "Tricep Extension (Dumbbell, Overhead)",
    primaryMuscle: "triceps",
    secondaryMuscles: [],
    requiredEquipment: ["dumbbells"],
  },
  {
    name: "Tricep Extension (Cable, Overhead)",
    primaryMuscle: "triceps",
    secondaryMuscles: [],
    requiredEquipment: ["cables"],
  },
  {
    name: "Skull Crusher",
    primaryMuscle: "triceps",
    secondaryMuscles: [],
    requiredEquipment: ["barbell", "ez_bar"],
  },
  {
    name: "Tricep Dip",
    primaryMuscle: "triceps",
    secondaryMuscles: ["chest", "anterior_deltoids"],
    requiredEquipment: ["dip_bars"],
  },

  // ── Legs — Quads ─────────────────────────────────────────────────────────
  {
    name: "Back Squat (Barbell)",
    primaryMuscle: "quadriceps",
    secondaryMuscles: ["glutes", "hamstrings", "core"],
    requiredEquipment: ["barbell", "rack"],
  },
  {
    name: "Front Squat (Barbell)",
    primaryMuscle: "quadriceps",
    secondaryMuscles: ["glutes", "core"],
    requiredEquipment: ["barbell", "rack"],
  },
  {
    name: "Leg Press",
    primaryMuscle: "quadriceps",
    secondaryMuscles: ["glutes", "hamstrings"],
    requiredEquipment: ["leg_press"],
  },
  {
    name: "Leg Press (High Foot)",
    primaryMuscle: "quadriceps",
    secondaryMuscles: ["glutes"],
    requiredEquipment: ["leg_press"],
  },
  {
    name: "Leg Extension (Machine)",
    primaryMuscle: "quadriceps",
    secondaryMuscles: [],
    requiredEquipment: ["leg_extension_machine"],
  },
  {
    name: "Bulgarian Split Squat (Barbell)",
    primaryMuscle: "quadriceps",
    secondaryMuscles: ["glutes", "hamstrings"],
    requiredEquipment: ["barbell"],
  },
  {
    name: "Bulgarian Split Squat (Dumbbell)",
    primaryMuscle: "quadriceps",
    secondaryMuscles: ["glutes", "hamstrings"],
    requiredEquipment: ["dumbbells"],
  },
  {
    name: "Lunge (Walking)",
    primaryMuscle: "quadriceps",
    secondaryMuscles: ["glutes", "hamstrings"],
    requiredEquipment: [],
  },
  {
    name: "Nordic Curl (Reverse)",
    primaryMuscle: "quadriceps",
    secondaryMuscles: ["hip_flexors"],
    requiredEquipment: [],
  },
  {
    name: "Wall Sit (Isometric)",
    primaryMuscle: "quadriceps",
    secondaryMuscles: [],
    requiredEquipment: [],
  },

  // ── Legs — Hamstrings & Glutes ───────────────────────────────────────────
  {
    name: "Romanian Deadlift (Barbell)",
    primaryMuscle: "hamstrings",
    secondaryMuscles: ["glutes", "back"],
    requiredEquipment: ["barbell"],
  },
  {
    name: "Romanian Deadlift (Dumbbell)",
    primaryMuscle: "hamstrings",
    secondaryMuscles: ["glutes", "back"],
    requiredEquipment: ["dumbbells"],
  },
  {
    name: "Leg Curl (Machine)",
    primaryMuscle: "hamstrings",
    secondaryMuscles: [],
    requiredEquipment: ["leg_curl_machine"],
  },
  {
    name: "Nordic Curl",
    primaryMuscle: "hamstrings",
    secondaryMuscles: ["glutes", "calves"],
    requiredEquipment: [],
  },
  {
    name: "Hip Thrust (Barbell)",
    primaryMuscle: "glutes",
    secondaryMuscles: ["hamstrings", "core"],
    requiredEquipment: ["barbell"],
  },
  {
    name: "Hip Thrust (Dumbbell)",
    primaryMuscle: "glutes",
    secondaryMuscles: ["hamstrings", "core"],
    requiredEquipment: ["dumbbells"],
  },
  {
    name: "Hip Thrust (Machine)",
    primaryMuscle: "glutes",
    secondaryMuscles: ["hamstrings", "core"],
    requiredEquipment: ["hip_thrust_machine"],
  },
  {
    name: "Kickback (Cable)",
    primaryMuscle: "glutes",
    secondaryMuscles: ["hamstrings"],
    requiredEquipment: ["cables"],
  },

  // ── Calves ───────────────────────────────────────────────────────────────
  {
    name: "Calf Raise (Standing)",
    primaryMuscle: "calves",
    secondaryMuscles: ["soleus"],
    requiredEquipment: [],
  },
  {
    name: "Calf Raise (Machine)",
    primaryMuscle: "calves",
    secondaryMuscles: ["soleus"],
    requiredEquipment: ["calf_raise_machine"],
  },
  {
    name: "Calf Raise (Seated)",
    primaryMuscle: "soleus",
    secondaryMuscles: ["calves"],
    requiredEquipment: ["seated_calf_raise_machine"],
  },
  {
    name: "Achilles Eccentric",
    primaryMuscle: "soleus",
    secondaryMuscles: [],
    requiredEquipment: [],
  },
  {
    name: "Achilles Eccentric (Weighted)",
    primaryMuscle: "soleus",
    secondaryMuscles: [],
    requiredEquipment: ["barbell", "dumbbells"],
  },
  {
    name: "Pogo Jumps (Activation)",
    primaryMuscle: "calves",
    secondaryMuscles: [],
    requiredEquipment: [],
  },

  // ── Core ─────────────────────────────────────────────────────────────────
  {
    name: "Plank",
    primaryMuscle: "core",
    secondaryMuscles: ["obliques", "glutes"],
    requiredEquipment: [],
  },
  {
    name: "Side Plank",
    primaryMuscle: "obliques",
    secondaryMuscles: ["core"],
    requiredEquipment: [],
  },
  {
    name: "Crunch (Cable)",
    primaryMuscle: "core",
    secondaryMuscles: [],
    requiredEquipment: ["cables"],
  },
  {
    name: "Ab Crunch",
    primaryMuscle: "core",
    secondaryMuscles: [],
    requiredEquipment: [],
  },
  {
    name: "Leg Raise (Hanging)",
    primaryMuscle: "core",
    secondaryMuscles: ["hip_flexors"],
    requiredEquipment: ["pullup_bar"],
  },
  {
    name: "Ab Wheel Rollout",
    primaryMuscle: "core",
    secondaryMuscles: ["obliques", "back"],
    requiredEquipment: ["ab_wheel"],
  },
  {
    name: "Russian Twist",
    primaryMuscle: "obliques",
    secondaryMuscles: ["core"],
    requiredEquipment: [],
  },

  // ── Hip Flexors ──────────────────────────────────────────────────────────
  {
    name: "Psoas March (Activation)",
    primaryMuscle: "hip_flexors",
    secondaryMuscles: [],
    requiredEquipment: [],
  },
  {
    name: "Psoas March (Strengthening)",
    primaryMuscle: "hip_flexors",
    secondaryMuscles: [],
    requiredEquipment: [],
  },
  {
    name: "Standing Band Psoas March (Activation)",
    primaryMuscle: "hip_flexors",
    secondaryMuscles: [],
    requiredEquipment: ["bands"],
  },
  {
    name: "Incline Bench Psoas March (Activation)",
    primaryMuscle: "hip_flexors",
    secondaryMuscles: [],
    requiredEquipment: [],
  },
  {
    name: "Isometric Soleus Hold (Mini-band)",
    primaryMuscle: "soleus",
    secondaryMuscles: [],
    requiredEquipment: ["bands"],
  },

  // ── Full body / cardio accessories ───────────────────────────────────────
  {
    name: "Burpee",
    primaryMuscle: "full_body",
    secondaryMuscles: ["chest", "core", "quadriceps"],
    requiredEquipment: [],
  },
  {
    name: "Swing (Kettlebell)",
    primaryMuscle: "glutes",
    secondaryMuscles: ["hamstrings", "core", "back"],
    requiredEquipment: ["kettlebells"],
  },
  {
    name: "Farmers Carry",
    primaryMuscle: "traps",
    secondaryMuscles: ["core", "forearms", "glutes"],
    requiredEquipment: ["dumbbells"],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string) {
  process.stdout.write(msg + "\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const db = createDb(DATABASE_URL);

  // ── 1. Test user ────────────────────────────────────────────────────────

  log("\n[1/2] Creating test user...");

  // Check if the user already exists in auth.users via Supabase admin API
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existing = existingUsers?.users?.find((u) => u.email === TEST_USER.email);

  if (existing) {
    log(`  Skipped — user ${TEST_USER.email} already exists (id: ${existing.id})`);

    // Ensure profile row exists too
    const profile = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, existing.id))
      .limit(1);
    if (profile.length === 0) {
      await db.insert(userProfiles).values({
        userId: existing.id,
        displayName: TEST_USER.displayName,
      });
      log(`  Profile row created for existing user.`);
    }
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: TEST_USER.email,
      password: TEST_USER.password,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new Error(`Failed to create auth user: ${error?.message}`);
    }
    await db.insert(userProfiles).values({
      userId: data.user.id,
      displayName: TEST_USER.displayName,
    });
    log(`  Created user ${TEST_USER.email} (id: ${data.user.id})`);
  }

  // ── 2. Exercises ─────────────────────────────────────────────────────────

  log(`\n[2/2] Seeding ${EXERCISES.length} exercises...`);

  const canonicalNames = EXERCISES.map((e) => e.name);

  // Remove any exercises whose names are no longer in the canonical list
  const removed = await db
    .delete(exercises)
    .where(notInArray(exercises.name, canonicalNames))
    .returning({ name: exercises.name });

  if (removed.length > 0) {
    log(`  Removed ${removed.length} stale exercises: ${removed.map((e) => e.name).join(", ")}`);
  }

  let inserted = 0;
  let skipped = 0;

  for (const ex of EXERCISES) {
    const result = await db
      .insert(exercises)
      .values({
        name: ex.name,
        primaryMuscle: ex.primaryMuscle,
        secondaryMuscles: ex.secondaryMuscles,
        requiredEquipment: ex.requiredEquipment,
      })
      .onConflictDoNothing()
      .returning({ id: exercises.id });

    if (result.length > 0) {
      inserted++;
    } else {
      skipped++;
    }
  }

  log(`  Inserted: ${inserted}  Skipped (already exist): ${skipped}`);

  // ── Done ────────────────────────────────────────────────────────────────

  log("\nSeed complete.\n");
  log(`  Test user email:    ${TEST_USER.email}`);
  log(`  Test user password: ${TEST_USER.password}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
