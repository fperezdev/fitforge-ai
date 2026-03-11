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
    parts.push(`## Athlete Profile
- Name: ${p.displayName}
- Experience: ${p.experienceLevel ?? "unknown"}
- Goal: ${p.fitnessGoal ?? "not specified"}
- Height: ${p.heightCm ? `${p.heightCm} cm` : "unknown"}
- Units: ${p.unitPreference}`);
  }

  if (ctx.weightTrend.length > 0) {
    const latest = ctx.weightTrend[ctx.weightTrend.length - 1];
    const oldest = ctx.weightTrend[0];
    const change = (latest.weightKg - oldest.weightKg).toFixed(1);
    parts.push(`## Body Weight
- Current: ${latest.weightKg} kg
- Trend (${ctx.weightTrend.length} days): ${Number(change) >= 0 ? "+" : ""}${change} kg`);
  }

  if (ctx.activeGoals.length > 0) {
    parts.push(
      `## Active Goals\n` +
        ctx.activeGoals
          .map(
            (g) =>
              `- ${g.type}: ${g.currentValue} → ${g.targetValue} ${g.unit}` +
              (g.targetDate ? ` (by ${g.targetDate})` : "")
          )
          .join("\n")
    );
  }

  if (ctx.personalRecords.length > 0) {
    parts.push(
      `## Personal Records (estimated 1RM)\n` +
        ctx.personalRecords
          .map(
            (pr) =>
              `- ${pr.exercise?.name ?? pr.exerciseId}: ${pr.value} kg`
          )
          .join("\n")
    );
  }

  if (ctx.recentSessions.length > 0) {
    parts.push(`## Recent Workout Sessions (last ${ctx.recentSessions.length})`);
    ctx.recentSessions.forEach((s) => {
      const date = s.completedAt?.split("T")[0] ?? s.startedAt.split("T")[0];
      const exerciseSummary =
        s.entries
          ?.map((e) => {
            const workingSets = e.sets?.filter((set) => set.type === "working" && set.completed) ?? [];
            if (workingSets.length === 0) return null;
            const topSet = workingSets.reduce(
              (best, set) =>
                (set.weightKg ?? 0) > (best.weightKg ?? 0) ? set : best,
              workingSets[0]
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
      const date = c.completedAt?.split("T")[0] ?? c.startedAt.split("T")[0];
      const dist = c.distanceMeters
        ? `${(c.distanceMeters / 1000).toFixed(2)} km`
        : "?";
      const pace = c.avgPaceSecondsPerKm
        ? `${Math.floor(c.avgPaceSecondsPerKm / 60)}:${String(c.avgPaceSecondsPerKm % 60).padStart(2, "0")} /km`
        : "?";
      parts.push(`- ${date}: ${c.type} — ${dist} @ ${pace}`);
    });
  }

  return parts.join("\n\n");
}

const SYSTEM_PROMPT = `You are FitForge AI, an expert personal trainer and running coach with deep knowledge of:
- Hypertrophy training (progressive overload, volume, RIR/RPE, exercise selection, periodisation)
- Running training (aerobic base, tempo runs, intervals, pace zones, race preparation)
- Nutrition basics for body recomposition
- Recovery, deload, and injury prevention

Your tone is direct, evidence-based, and encouraging. You give actionable advice.

When asked to create a workout plan, output it as a JSON block inside <plan>...</plan> tags with this structure:
{
  "name": "Plan name",
  "description": "Brief description",
  "weeks": [
    {
      "week": 1,
      "days": [
        {
          "day": "Monday",
          "name": "Push A",
          "exercises": [
            {
              "name": "Bench Press",
              "sets": 4,
              "repMin": 8,
              "repMax": 12,
              "restSeconds": 120
            }
          ]
        }
      ]
    }
  ]
}

Always provide context around the plan with explanations. The <plan> block can be parsed by the app to save it directly.`;

export async function streamCoachResponse(
  userMessage: string,
  context: CoachContext,
  onChunk: (chunk: string) => void
): Promise<string> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const contextStr = formatContext(context);
  const history = context.conversationHistory.slice(-10); // keep last 10 for token budget

  const chat = model.startChat({
    systemInstruction: {
      role: "system",
      parts: [{ text: SYSTEM_PROMPT + "\n\n## Current Athlete Data\n" + contextStr }],
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
