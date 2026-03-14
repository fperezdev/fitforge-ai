import { GoogleGenerativeAI } from "@google/generative-ai";
import type { CoachContext } from "../domain/types.js";

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
    parts.push(
      `## Athlete Profile
- Name: ${p.displayName}
- Age: ${age !== null ? `${age} years` : "unknown"}
- Gender: ${p.gender ?? "not specified"}
- Experience: ${p.experienceLevel ?? "unknown"}
- Goal: ${p.fitnessGoal ?? "not specified"}
- Height: ${p.heightCm ? `${p.heightCm} cm` : "unknown"}
- Units: ${p.unitPreference}
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
          .map((pr) => `- ${pr.exercise?.name ?? pr.exerciseId}: ${pr.value} kg`)
          .join("\n"),
    );
  }

  if (ctx.recentSessions.length > 0) {
    parts.push(`## Recent Workout Sessions (last ${ctx.recentSessions.length})`);
    ctx.recentSessions.forEach((s) => {
      const date = (
        s.completedAt ? new Date(s.completedAt).toISOString() : new Date(s.startedAt).toISOString()
      ).split("T")[0];
      const exerciseSummary =
        s.entries
          ?.map((e) => {
            const workingSets =
              e.sets?.filter((set) => set.type === "working" && set.completed) ?? [];
            if (workingSets.length === 0) return null;
            const topSet = workingSets.reduce(
              (best, set) => ((set.weightKg ?? 0) > (best.weightKg ?? 0) ? set : best),
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
    ctx.recentCardio.forEach((c) => {
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
When you generate the plan, always wrap it in <plan>...</plan> tags as specified above.
After the plan is delivered, the user may ask for changes — apply them and output a full updated plan in <plan>...</plan> tags each time.`,
};

function formatExerciseLibrary(exercises: CoachContext["exercises"]): string {
  if (exercises.length === 0) return "";
  const lines = exercises.map(
    (e) =>
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

  const modeInstruction = context.conversationMode
    ? (MODE_INSTRUCTIONS[context.conversationMode] ?? "")
    : "";

  const chat = model.startChat({
    systemInstruction: {
      role: "system",
      parts: [
        {
          text:
            BASE_SYSTEM_PROMPT +
            modeInstruction +
            "\n\n" +
            formatExerciseLibrary(context.exercises) +
            "\n\n## Current Athlete Data\n" +
            contextStr,
        },
      ],
    },
    history: history.map((m) => ({
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
