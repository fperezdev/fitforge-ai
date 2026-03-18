// Shared domain types — no framework dependencies, consumed by both api and web

export const EQUIPMENT_OPTIONS = [
  "full_gym",
  "barbell",
  "rack",
  "dumbbells",
  "kettlebells",
  "ez_bar",
  "cables",
  "smith_machine",
  "leg_press",
  "leg_curl_machine",
  "leg_extension_machine",
  "calf_raise_machine",
  "chest_fly_machine",
  "lat_pulldown_machine",
  "seated_row_machine",
  "hack_squat_machine",
  "hip_thrust_machine",
  "shoulder_press_machine",
  "bicep_curl_machine",
  "tricep_machine",
  "pullup_bar",
  "dip_bars",
  "bands",
  "bodyweight",
] as const;

export type EquipmentOption = (typeof EQUIPMENT_OPTIONS)[number];

export interface UserProfile {
  id: string;
  userId: string;
  displayName: string;
  dateOfBirth: string | null;
  gender: string | null;
  heightCm: number | null;
  unitPreference: "metric" | "imperial";
  fitnessGoal: string | null;
  experienceLevel: string | null;
  injuries: string | null;
  equipment: EquipmentOption[];
  createdAt?: string;
  updatedAt?: string;
}

export type Muscle =
  | "chest"
  | "upper_chest"
  | "lower_chest"
  | "back"
  | "lats"
  | "upper_back"
  | "lower_back"
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

export interface Exercise {
  id: string;
  name: string;
  primaryMuscle: Muscle;
  secondaryMuscles: Muscle[];
  requiredEquipment: string[];
}

export interface WorkoutTemplate {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  exercises: TemplateExercise[];
}

export interface TemplateExercise {
  id: string;
  exerciseId: string;
  exercise?: Exercise;
  order: number;
  targetSets: number;
  targetRepMin: number;
  targetRepMax: number;
  restSeconds: number | null;
}

export interface WorkoutSession {
  id: string;
  userId: string;
  name: string | null;
  status: "in_progress" | "completed" | "cancelled";
  startedAt: string;
  completedAt: string | null;
  notes: string | null;
  entries?: ExerciseEntry[];
}

export interface ExerciseEntry {
  id: string;
  workoutSessionId: string;
  exerciseId: string;
  exercise?: Exercise;
  order: number;
  sets: ExerciseSet[];
}

export interface ExerciseSet {
  id: string;
  exerciseEntryId: string;
  setNumber: number;
  type: "warmup" | "working" | "dropset" | "failure";
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  durationSeconds: number | null;
  restSeconds: number | null;
  completed: boolean;
}

export interface CardioSession {
  id: string;
  userId: string;
  type: string;
  status: "in_progress" | "completed" | "cancelled";
  startedAt: string;
  completedAt: string | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  avgPaceSecondsPerKm: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  caloriesBurned: number | null;
  elevationGainMeters: number | null;
  notes: string | null;
  planDayId: string | null;
  weekIndex: number | null;
  dayIndex: number | null;
}

export interface WeightEntry {
  id: string;
  userId: string;
  date: string;
  weightKg: number;
  notes: string | null;
}

export interface BodyMeasurement {
  id: string;
  userId: string;
  date: string;
  bodyFatPercent: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  bicepLeftCm: number | null;
  bicepRightCm: number | null;
  thighLeftCm: number | null;
  thighRightCm: number | null;
  calfLeftCm: number | null;
  calfRightCm: number | null;
  shouldersCm: number | null;
  neckCm: number | null;
  notes: string | null;
}

export interface TrainingPlan {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  status: string;
  microcycleLength: number;
  mesocycleLength: number;
  activatedAt: string | null;
  startDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalRecord {
  id: string;
  userId: string;
  exerciseId: string;
  exercise?: Exercise;
  type: "max_weight" | "max_reps" | "estimated_1rm";
  value: number;
  previousValue: number | null;
  achievedAt: string;
}

export interface CoachConversation {
  id: string;
  userId: string;
  title: string | null;
  mode: "advice" | "plan" | null;
  status: "active" | "closed";
  createdAt: string;
  updatedAt: string;
}

export interface CoachMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface CoachContext {
  profile: UserProfile | null;
  conversationMode: "advice" | "plan" | null;
  recentSessions: WorkoutSession[];
  recentCardio: CardioSession[];
  personalRecords: PersonalRecord[];
  weightTrend: WeightEntry[];
  bodyMeasurements: BodyMeasurement[];
  currentPlan: TrainingPlan | null;
  conversationHistory: CoachMessage[];
  exercises: Exercise[];
}
