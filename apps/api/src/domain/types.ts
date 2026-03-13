// Domain types — plain TypeScript, no framework dependencies

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
}

export interface WeightEntry {
  id: string;
  userId: string;
  date: string;
  weightKg: number;
  notes: string | null;
}

export interface BodyGoal {
  id: string;
  userId: string;
  type: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  startDate: string;
  targetDate: string | null;
  status: "active" | "completed" | "cancelled";
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

// Context fed to the AI coach
export interface CoachContext {
  profile: UserProfile | null;
  recentSessions: WorkoutSession[];
  recentCardio: CardioSession[];
  personalRecords: PersonalRecord[];
  weightTrend: WeightEntry[];
  activeGoals: BodyGoal[];
  conversationHistory: CoachMessage[];
  exercises: Exercise[];
}
