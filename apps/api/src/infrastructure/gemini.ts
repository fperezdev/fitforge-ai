import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  CoachContext,
  CoachMessage,
  PersonalRecord,
  WorkoutSession,
  ExerciseEntry,
  ExerciseSet,
  CardioSession,
  Exercise,
} from "../domain/types.js";

// Equipment display labels for the LLM prompt
const EQUIPMENT_LABELS: Record<string, string> = {
  full_gym: "Full Gym",
  barbell: "Barbell + plates",
  rack: "Squat / power rack",
  dumbbells: "Dumbbells",
  kettlebells: "Kettlebells",
  ez_bar: "EZ bar",
  cables: "Cable machine",
  smith_machine: "Smith machine",
  leg_press: "Leg press machine",
  leg_curl_machine: "Leg curl machine",
  leg_extension_machine: "Leg extension machine",
  calf_raise_machine: "Calf raise machine",
  chest_fly_machine: "Pec deck / chest fly",
  lat_pulldown_machine: "Lat pulldown machine",
  seated_row_machine: "Seated row machine",
  hack_squat_machine: "Hack squat machine",
  hip_thrust_machine: "Hip thrust / glute machine",
  shoulder_press_machine: "Shoulder press machine",
  bicep_curl_machine: "Bicep curl machine",
  tricep_machine: "Tricep press / dip machine",
  pullup_bar: "Pull-up bar",
  dip_bars: "Dip bars",
  bands: "Resistance bands",
  bodyweight: "Bodyweight only",
};

function filterExercisesByEquipment(
  exercises: Exercise[],
  equipment: string[] | null | undefined,
): Exercise[] {
  // No profile or full_gym → no restriction, send all
  if (!equipment || equipment.length === 0 || equipment.includes("full_gym")) {
    return exercises;
  }
  return exercises.filter(
    (e) =>
      // bodyweight / no equipment required → always available
      e.requiredEquipment.length === 0 ||
      // user has at least one of the required items
      e.requiredEquipment.some((req) => equipment.includes(req)),
  );
}

function getGeminiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is required");
  return new GoogleGenerativeAI(key);
}

function formatContext(ctx: CoachContext): string {
  const parts: string[] = [];

  if (ctx.profile) {
    const p = ctx.profile;
    const age = p.dateOfBirth
      ? Math.floor(
          (Date.now() - new Date(p.dateOfBirth).getTime()) / (1000 * 60 * 60 * 24 * 365.25),
        )
      : null;
    const equipmentStr =
      !p.equipment || p.equipment.length === 0 || p.equipment.includes("full_gym")
        ? "Full Gym (no restriction)"
        : p.equipment.map((e) => EQUIPMENT_LABELS[e] ?? e).join(", ");
    parts.push(
      `## Athlete Profile
- Name: ${p.displayName}
- Age: ${age !== null ? `${age} years` : "unknown"}
- Gender: ${p.gender ?? "not specified"}
- Experience: ${p.experienceLevel ?? "unknown"}
- Goal: ${p.fitnessGoal ?? "not specified"}
- Height: ${p.heightCm ? `${p.heightCm} cm` : "unknown"}
- Units: ${p.unitPreference}
- Equipment: ${equipmentStr}
- Injuries / Limitations: ${p.injuries?.trim() || "none reported"}`,
    );
  }

  if (ctx.weightTrend.length > 0) {
    const latest = ctx.weightTrend[ctx.weightTrend.length - 1];
    const oldest = ctx.weightTrend[0];
    const change = (latest.weightKg - oldest.weightKg).toFixed(1);
    parts.push(`## Body Weight
- Current: ${latest.weightKg} kg
- Trend (${ctx.weightTrend.length} days): ${Number(change) >= 0 ? "+" : ""}${change} kg`);
  }

  if (ctx.personalRecords.length > 0) {
    parts.push(
      `## Personal Records (estimated 1RM)\n` +
        ctx.personalRecords
          .map((pr: PersonalRecord) => `- ${pr.exercise?.name ?? pr.exerciseId}: ${pr.value} kg`)
          .join("\n"),
    );
  }

  if (ctx.recentSessions.length > 0) {
    parts.push(`## Recent Workout Sessions (last ${ctx.recentSessions.length})`);
    ctx.recentSessions.forEach((s: WorkoutSession) => {
      const date = (
        s.completedAt ? new Date(s.completedAt).toISOString() : new Date(s.startedAt).toISOString()
      ).split("T")[0];
      const exerciseSummary =
        s.entries
          ?.map((e: ExerciseEntry) => {
            const workingSets =
              e.sets?.filter((set: ExerciseSet) => set.type === "working" && set.completed) ?? [];
            if (workingSets.length === 0) return null;
            const topSet = workingSets.reduce(
              (best: ExerciseSet, set: ExerciseSet) =>
                (set.weightKg ?? 0) > (best.weightKg ?? 0) ? set : best,
              workingSets[0],
            );
            return `  • ${e.exercise?.name ?? "?"}: ${workingSets.length}×${topSet.reps ?? "?"} @ ${topSet.weightKg ?? "?"}kg`;
          })
          .filter(Boolean)
          .join("\n") ?? "  (no details)";
      parts.push(`### ${date} — ${s.name ?? "Unnamed"}\n${exerciseSummary}`);
    });
  }

  if (ctx.recentCardio.length > 0) {
    parts.push(`## Recent Cardio Sessions`);
    ctx.recentCardio.forEach((c: CardioSession) => {
      const date = (
        c.completedAt ? new Date(c.completedAt).toISOString() : new Date(c.startedAt).toISOString()
      ).split("T")[0];
      const dist = c.distanceMeters ? `${(c.distanceMeters / 1000).toFixed(2)} km` : "?";
      const pace = c.avgPaceSecondsPerKm
        ? `${Math.floor(c.avgPaceSecondsPerKm / 60)}:${String(c.avgPaceSecondsPerKm % 60).padStart(2, "0")} /km`
        : "?";
      parts.push(`- ${date}: ${c.type} — ${dist} @ ${pace}`);
    });
  }

  return parts.join("\n\n");
}

const BASE_SYSTEM_PROMPT = `You are FitForge AI, an expert personal trainer and running coach with deep knowledge of:
- Hypertrophy training (progressive overload, volume, RIR, exercise selection, periodisation)
- Running and cardio training (aerobic base, tempo runs, intervals, pace zones, race preparation)
- Nutrition basics for body recomposition
- Recovery, deload, and injury prevention

Your tone is direct, evidence-based, and encouraging. You give actionable advice.

## Exercise model
Each strength exercise has a name, primaryMuscle (required, exactly one value), and secondaryMuscles (optional array).
Each muscle must be one of:
  chest | upper_chest | lower_chest |
  back | lats | upper_back | lower_back | traps |
  anterior_deltoids | lateral_deltoids | posterior_deltoids |
  biceps | triceps | forearms |
  core | obliques |
  glutes | quadriceps | hamstrings | calves | soleus | hip_flexors | adductors |
  full_body | other

Prefer exercises from the exercise library when possible. You may also suggest new exercises not in the library — they will be created automatically.

When asked to create a workout plan, output it as a JSON block inside <plan>...</plan> tags with this structure:
{
  "name": "Plan name",
  "description": "Brief description",
  "weeks": [
    {
      "week": 1,
      "days": [
        {
          "day": 1,
          "workout": {
            "name": "Push A",
            "exercises": [
              {
                "name": "Bench Press",
                "primaryMuscle": "chest",
                "secondaryMuscles": ["anterior_deltoids", "triceps"],
                "sets": 4, "repMin": 8, "repMax": 12, "restSeconds": 120, "rir": 2
              }
            ]
          },
          "cardio": {
            "name": "Easy Run",
            "exercises": [
              { "name": "Easy Run", "zone": 2, "kilometers": 5 }
            ]
          }
        },
        {
          "day": 2,
          "cardio": {
            "name": "Long Run",
            "exercises": [
              { "name": "Long Run", "zone": 3, "kilometers": 20 }
            ]
          }
        },
        {
          "day": 3,
          "rest": true,
          "restNote": "Light walk or full rest"
        }
      ]
    }
  ]
}

Field rules:
- "day": integer, 1-based day number within the week.
- "workout": optional. Strength/hypertrophy block. Contains "name" and "exercises[]".
  - Each exercise: name, primaryMuscle (required, exactly one value), secondaryMuscles (array, optional), sets (int), repMin (int), repMax (int), restSeconds (int, optional), rir (int 0–4, required).
- "cardio": optional. Cardio block. Contains "name" and "exercises[]".
  - Each exercise: name, zone (1–5, required), kilometers (required).
- "rest": true for full rest days. No workout or cardio on rest days. Optional "restNote".
- A day can have workout only, cardio only, both, or rest.
- Weight exercises must NOT include zone/kilometers. Cardio exercises must NOT include sets/reps/rir/muscles.

Always provide context around the plan with explanations. The <plan> block can be parsed by the app to save it directly.`;

const MODE_INSTRUCTIONS: Record<"advice" | "plan", string> = {
  advice: `
## Session Mode: Training Advice
This conversation is strictly for training advice — hypertrophy and cardio topics only.
If the user asks about anything unrelated to training (nutrition beyond the basics, medical advice, lifestyle, general topics, etc.), politely decline and redirect them to ask a training-related question.
Do NOT generate full workout plans in this mode — if the user asks for a plan, tell them to start a new "Plan Making" conversation.`,
  plan: `
## Session Mode: Plan Making
This conversation is strictly for creating and refining a training plan.
Only discuss the plan itself: exercise selection, structure, volume, progression, and adjustments.
If the user asks about anything unrelated to the training plan, politely decline and redirect them.

When generating a plan:
- If you have enough context to produce a quality plan, wrap it in <plan>...</plan> tags as specified above.
- If you need more information before producing a good plan (e.g. schedule availability, specific goals, injuries, equipment), ask the user targeted questions first. Do not generate a plan until you have enough context.

After a plan is delivered:
- The user may come back with feedback or edits. Their message will include their current draft plan as context.
- Ask clarifying questions if needed before generating a revised plan.
- When you are ready to produce an updated plan, output a full new plan in <plan>...</plan> tags.
- Never output a partial plan — always output the complete plan structure each time.`,
};

function formatExerciseLibrary(exercises: CoachContext["exercises"]): string {
  if (exercises.length === 0) return "";
  const lines = exercises.map(
    (e: Exercise) =>
      `- ${e.name}: primary=${e.primaryMuscle}` +
      (e.secondaryMuscles.length > 0 ? `, secondary=[${e.secondaryMuscles.join(", ")}]` : ""),
  );
  return `## Exercise Library\n${lines.join("\n")}`;
}

export async function streamCoachResponse(
  userMessage: string,
  context: CoachContext,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

  const contextStr = formatContext(context);
  const history = context.conversationHistory.slice(-10); // keep last 10 for token budget

  const mode = context.conversationMode;
  const modeInstruction = mode ? (MODE_INSTRUCTIONS[mode] ?? "") : "";

  // Filter exercise library to only what the user's equipment supports
  const availableExercises = filterExercisesByEquipment(
    context.exercises,
    context.profile?.equipment ?? null,
  );

  const chat = model.startChat({
    systemInstruction: {
      role: "system",
      parts: [
        {
          text:
            BASE_SYSTEM_PROMPT +
            modeInstruction +
            "\n\n" +
            formatExerciseLibrary(availableExercises) +
            "\n\n## Current Athlete Data\n" +
            contextStr,
        },
      ],
    },
    history: history.map((m: CoachMessage) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    })),
  });

  const result = await chat.sendMessageStream(userMessage);

  let fullResponse = "";
  for await (const chunk of result.stream) {
    const text = chunk.text();
    fullResponse += text;
    onChunk(text);
  }

  return fullResponse;
}
