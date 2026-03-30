import { useState } from "react";
import { TrendingUp, Flame, Dumbbell, Activity, Layers, Weight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdherenceWeek {
  weekIndex: number;
  planned: number;
  completed: number;
  skipped: number;
  pending: number;
}

export interface AdherenceComponent {
  totalPlanned: number;
  totalCompleted: number;
  totalSkipped: number;
  totalPending: number;
  weeks: AdherenceWeek[];
}

export interface Adherence {
  completionRate: number;
  totalPlanned: number;
  totalCompleted: number;
  totalSkipped: number;
  totalPending: number;
  currentStreak: number;
  longestStreak: number;
  totalVolume: { sets: number; reps: number; weightKg: number };
  weeks: AdherenceWeek[];
  strength: AdherenceComponent;
  cardio: AdherenceComponent;
}

export function PlanAdherenceCard({ adherence }: { adherence: Adherence }) {
  const [tab, setTab] = useState<"all" | "strength" | "cardio">("all");

  const pct = Math.round(adherence.completionRate * 100);

  const component =
    tab === "strength" ? adherence.strength : tab === "cardio" ? adherence.cardio : null;
  const weeksToShow = component ? component.weeks : adherence.weeks.filter((w) => w.planned > 0);
  const hasData = weeksToShow.some((w) => w.planned > 0);
  const totals = component
    ? {
        planned: component.totalPlanned,
        completed: component.totalCompleted,
        skipped: component.totalSkipped,
        missed: component.totalPending,
      }
    : {
        planned: adherence.totalPlanned,
        completed: adherence.totalCompleted,
        skipped: adherence.totalSkipped,
        missed: adherence.totalPending,
      };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Plan Adherence</h3>
      </div>

      {/* Tab switcher */}
      <div
        className="inline-flex w-full rounded-lg border border-border bg-muted p-0.5 gap-0.5"
        role="tablist"
        aria-label="Adherence filter"
      >
        {(
          [
            { key: "all", label: "All", icon: <Layers className="h-3.5 w-3.5" /> },
            { key: "strength", label: "Strength", icon: <Dumbbell className="h-3.5 w-3.5" /> },
            { key: "cardio", label: "Cardio", icon: <Activity className="h-3.5 w-3.5" /> },
          ] as const
        ).map(({ key, label, icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              tab === key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Key stats — only on All tab */}
      {tab === "all" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{pct}%</p>
              <p className="text-xs text-muted-foreground mt-0.5">Completion</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <div className="flex items-center justify-center gap-1">
                <Flame className="h-4 w-4 text-orange-500" />
                <p className="text-2xl font-bold tabular-nums">{adherence.currentStreak}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">Current streak</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{adherence.longestStreak}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Longest streak</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-2xl font-bold tabular-nums">{adherence.totalVolume.sets}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total sets</p>
            </div>
          </div>

          {adherence.totalVolume.sets > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Weight className="h-3.5 w-3.5" />
              <span>
                {adherence.totalVolume.reps.toLocaleString()} reps ·{" "}
                {adherence.totalVolume.weightKg.toLocaleString()} kg total volume
              </span>
            </div>
          )}
        </>
      )}

      {/* Per-week breakdown */}
      {hasData ? (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-x-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            <span>Wk</span>
            <span className="text-center">Planned</span>
            <span className="text-center text-emerald-600 dark:text-emerald-400">Done</span>
            <span className="text-center text-amber-600 dark:text-amber-400">Skip</span>
            <span className="text-center text-destructive/70">Pending</span>
          </div>
          {weeksToShow.map((w) => (
            <div
              key={w.weekIndex}
              className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-x-2 items-center rounded-md bg-muted/30 px-2 py-1.5 text-sm"
            >
              <span className="text-xs font-semibold text-muted-foreground w-10">
                W{w.weekIndex + 1}
              </span>
              <span className="text-center tabular-nums">{w.planned}</span>
              <span className="text-center tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                {w.completed}
              </span>
              <span className="text-center tabular-nums text-amber-600 dark:text-amber-400">
                {w.skipped}
              </span>
              <span className="text-center tabular-nums text-destructive/70">{w.pending}</span>
            </div>
          ))}

          {totals.planned > 0 && (
            <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-x-2 items-center rounded-md border border-border/60 px-2 py-1.5 text-sm font-semibold mt-1">
              <span className="text-xs font-semibold text-muted-foreground w-10">Total</span>
              <span className="text-center tabular-nums">{totals.planned}</span>
              <span className="text-center tabular-nums text-emerald-600 dark:text-emerald-400">
                {totals.completed}
              </span>
              <span className="text-center tabular-nums text-amber-600 dark:text-amber-400">
                {totals.skipped}
              </span>
              <span className="text-center tabular-nums text-destructive/70">{totals.missed}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">
          {tab === "all"
            ? "No data yet — complete your first planned workout to see stats."
            : `No ${tab} data yet.`}
        </p>
      )}
    </div>
  );
}
