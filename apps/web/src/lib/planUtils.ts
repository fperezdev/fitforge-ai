export interface PlanDay {
  id: string;
  dayNumber: number;
  type: string;
  workoutTemplate: { id: string; name: string } | null;
  cardioTemplate: { id: string; name: string } | null;
}

export interface Microcycle {
  position: number; // 1-based
  days: PlanDay[];
}

export interface ActivePlan {
  id: string;
  name: string;
  microcycleLength: number;
  mesocycleLength: number;
  startDate: string | null;
  activatedAt: string | null;
  microcycles: Microcycle[];
  // "weekIndex:dayIndex" → array of status strings for that slot
  dayLogs: Record<string, string[]>;
}

export interface NextDay {
  planDayId: string;
  weekIndex: number;
  dayIndex: number;
  date: Date;
  template: { id: string; name: string };
}

function isDayFullyResolved(statuses: string[], hasWorkout: boolean, hasCardio: boolean): boolean {
  if (statuses.includes("skipped") || statuses.includes("completed")) return true;
  const workoutDone =
    !hasWorkout || statuses.includes("workout_completed") || statuses.includes("workout_skipped");
  const cardioDone =
    !hasCardio || statuses.includes("cardio_completed") || statuses.includes("cardio_skipped");
  return workoutDone && cardioDone;
}

/**
 * Walk forward from today's calendar position in the plan and return the first
 * training day slot where the given component (workout or cardio) is not yet
 * resolved. Mirrors the backend suggestedDay logic exactly.
 */
export function findNextDay(plan: ActivePlan, component: "workout" | "cardio"): NextDay | null {
  if (!plan.activatedAt && !plan.startDate) return null;

  const anchor = plan.startDate
    ? new Date(plan.startDate + "T00:00:00")
    : new Date(plan.activatedAt!);
  anchor.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const msPerDay = 86_400_000;
  const daysSince = Math.floor((today.getTime() - anchor.getTime()) / msPerDay);
  const totalDays = plan.microcycleLength * plan.mesocycleLength;

  for (let offset = 0; offset < totalDays; offset++) {
    const pos = daysSince + offset;
    const weekIndex = Math.floor(pos / plan.microcycleLength) % plan.mesocycleLength;
    const dayIndex = pos % plan.microcycleLength;
    const key = `${weekIndex}:${dayIndex}`;
    const statuses = plan.dayLogs[key] ?? [];

    const week = plan.microcycles.find((mc) => mc.position === weekIndex + 1);
    const day = week?.days.find((d) => d.dayNumber === dayIndex + 1);
    if (!day || day.type !== "training") continue;

    const hasWorkout = !!day.workoutTemplate;
    const hasCardio = !!day.cardioTemplate;

    // Skip fully-resolved days
    if (isDayFullyResolved(statuses, hasWorkout, hasCardio)) continue;

    // Skip if the component we care about isn't present or is already resolved
    if (component === "cardio") {
      if (!hasCardio) continue;
      if (statuses.includes("cardio_completed") || statuses.includes("cardio_skipped")) continue;
    }
    if (component === "workout") {
      if (!hasWorkout) continue;
      if (statuses.includes("workout_completed") || statuses.includes("workout_skipped")) continue;
    }

    const slotDate = new Date(anchor);
    slotDate.setDate(slotDate.getDate() + pos);

    return {
      planDayId: day.id,
      weekIndex,
      dayIndex,
      date: slotDate,
      template: component === "cardio" ? day.cardioTemplate! : day.workoutTemplate!,
    };
  }

  return null;
}

const msPerDay = 86_400_000;

export function getDateLabel(date: Date): { label: string; isToday: boolean } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - today.getTime()) / msPerDay);
  const formatted = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (diffDays === 0) return { label: `Today · ${formatted}`, isToday: true };
  if (diffDays === 1) return { label: `Tomorrow · ${formatted}`, isToday: false };
  return { label: formatted, isToday: false };
}
