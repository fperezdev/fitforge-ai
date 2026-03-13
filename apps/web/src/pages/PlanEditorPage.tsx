import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Layers,
  LayoutGrid,
  Check,
  Plus,
  Dumbbell,
  Activity,
  Trash2,
  Save,
  X,
  Search,
  Pencil,
  TrendingUp,
  Flame,
  Weight,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TemplateExercise {
  id: string;
  order: number;
  targetSets: number;
  targetRepMin: number;
  targetRepMax: number;
  rir: number | null;
  restSeconds: number | null;
  exercise: {
    id: string;
    name: string;
    primaryMuscle: string;
  };
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  templateExercises: TemplateExercise[];
}

interface CardioTemplateExercise {
  id: string;
  order: number;
  name: string;
  zone: number | null;
  kilometers: string | null;
}

interface CardioTemplate {
  id: string;
  name: string;
  description: string | null;
  cardioTemplateExercises: CardioTemplateExercise[];
}

interface PlanDay {
  id: string;
  planMicrocycleId: string;
  dayNumber: number;
  type: "training" | "rest";
  workoutTemplateId: string | null;
  workoutTemplate: Template | null;
  cardioTemplateId: string | null;
  cardioTemplate: CardioTemplate | null;
  notes: string | null;
}

interface PlanMicrocycle {
  id: string;
  position: number;
  name: string | null;
  days: PlanDay[];
}

interface TrainingPlan {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "completed";
  microcycleLength: number;
  mesocycleLength: number;
  startDate: string | null; // YYYY-MM-DD, set when plan was activated
  activatedAt: string | null; // ISO timestamp, fallback anchor for legacy rows
  microcycles: PlanMicrocycle[];
}

interface Exercise {
  id: string;
  name: string;
  primaryMuscle: string;
}

type DayType = "training" | "rest";
type ViewMode = "mesocycle" | "daily";

// ─── Day type config ──────────────────────────────────────────────────────────

const DAY_TYPE_LABELS: Record<DayType, string> = {
  training: "Training",
  rest: "Rest",
};

const DAY_TYPE_COLORS: Record<DayType, string> = {
  training: "bg-primary/10 text-primary border-primary/20",
  rest: "bg-muted text-muted-foreground border-border",
};

// ─── Local edit-state types ───────────────────────────────────────────────────

interface StrengthRow {
  _key: string; // local stable key (uuid or existing id)
  exerciseId: string;
  exerciseName: string;
  exerciseMuscle: string;
  sets: number;
  repMin: number;
  repMax: number;
  rir: number | null;
  restSeconds: number | null;
}

interface CardioRow {
  _key: string;
  name: string;
  zone: number | null;
  kilometers: number | null;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

function templateToStrengthRows(t: Template): StrengthRow[] {
  return t.templateExercises.map((te) => ({
    _key: te.id,
    exerciseId: te.exercise.id,
    exerciseName: te.exercise.name,
    exerciseMuscle: te.exercise.primaryMuscle,
    sets: te.targetSets,
    repMin: te.targetRepMin,
    repMax: te.targetRepMax,
    rir: te.rir ?? null,
    restSeconds: te.restSeconds ?? null,
  }));
}

function cardioTemplateToRows(t: CardioTemplate): CardioRow[] {
  return t.cardioTemplateExercises.map((e) => ({
    _key: e.id,
    name: e.name,
    zone: e.zone ?? null,
    kilometers: e.kilometers != null ? parseFloat(e.kilometers) : null,
  }));
}

// ─── Exercise Search Combobox ─────────────────────────────────────────────────

function ExercisePicker({
  onSelect,
  onCancel,
}: {
  onSelect: (ex: Exercise) => void;
  onCancel: () => void;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { data: results = [], isFetching } = useQuery<Exercise[]>({
    queryKey: ["exercises-search", query],
    queryFn: () => api.get(`/exercises${query ? `?search=${encodeURIComponent(query)}` : ""}`),
    enabled: query.length >= 1 || query === "",
    staleTime: 30_000,
  });

  const handleChange = (v: string) => {
    setSearch(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setQuery(v), 300);
  };

  return (
    <div className="rounded-lg border border-border bg-card shadow-lg w-full max-w-xs">
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-border">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Search exercises…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button onClick={onCancel} className="p-0.5 rounded hover:bg-muted">
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
      <ul className="max-h-48 overflow-y-auto divide-y divide-border">
        {isFetching && (
          <li className="px-3 py-2 text-xs text-muted-foreground">Loading…</li>
        )}
        {!isFetching && results.length === 0 && (
          <li className="px-3 py-2 text-xs text-muted-foreground">No results</li>
        )}
        {results.map((ex) => (
          <li key={ex.id}>
            <button
              onClick={() => onSelect(ex)}
              className="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
            >
              <p className="text-sm font-medium">{ex.name}</p>
              <p className="text-[11px] text-muted-foreground">{ex.primaryMuscle}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Strength Editor ──────────────────────────────────────────────────────────

function StrengthEditor({
  rows,
  onChange,
}: {
  rows: StrengthRow[];
  onChange: (rows: StrengthRow[]) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);

  const update = (key: string, patch: Partial<StrengthRow>) => {
    onChange(rows.map((r) => (r._key === key ? { ...r, ...patch } : r)));
  };

  const remove = (key: string) => {
    onChange(rows.filter((r) => r._key !== key));
  };

  const addExercise = (ex: Exercise) => {
    onChange([
      ...rows,
      {
        _key: uid(),
        exerciseId: ex.id,
        exerciseName: ex.name,
        exerciseMuscle: ex.primaryMuscle,
        sets: 3,
        repMin: 8,
        repMax: 12,
        rir: null,
        restSeconds: null,
      },
    ]);
    setShowPicker(false);
  };

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <div className="grid grid-cols-[1fr_56px_96px_56px_68px_36px] gap-x-2 px-2 pb-1 bg-muted/30 rounded-t-md pt-2 border-b border-border">
          {["Exercise", "Sets", "Reps", "RIR", "Rest", ""].map((h) => (
            <span
              key={h}
              className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center first:text-left"
            >
              {h}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row._key}
            className="grid grid-cols-[1fr_56px_96px_56px_68px_36px] gap-x-2 items-center rounded-lg border border-border bg-card px-2 pl-3 py-2 shadow-sm transition-all focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20"
          >
            {/* Exercise name */}
            <div className="min-w-0 pr-2">
              <p className="text-sm font-semibold truncate leading-tight mb-0.5">{row.exerciseName}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{row.exerciseMuscle}</p>
            </div>

            {/* Sets */}
            <input
              type="number"
              min={1}
              value={row.sets}
              onChange={(e) =>
                update(row._key, { sets: Math.max(1, parseInt(e.target.value) || 1) })
              }
              className="w-full h-8 rounded-md border border-input bg-background px-2 text-center text-sm font-medium tabular-nums transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />

            {/* Reps (min–max shown as two inputs) */}
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                value={row.repMin}
                onChange={(e) =>
                  update(row._key, { repMin: Math.max(1, parseInt(e.target.value) || 1) })
                }
                className="w-full h-8 rounded-md border border-input bg-background p-0 text-center text-sm font-medium tabular-nums transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-muted-foreground/60 text-xs font-medium shrink-0">–</span>
              <input
                type="number"
                min={1}
                value={row.repMax}
                onChange={(e) =>
                  update(row._key, { repMax: Math.max(1, parseInt(e.target.value) || 1) })
                }
                className="w-full h-8 rounded-md border border-input bg-background p-0 text-center text-sm font-medium tabular-nums transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* RIR */}
            <input
              type="number"
              min={0}
              placeholder="—"
              value={row.rir ?? ""}
              onChange={(e) =>
                update(row._key, {
                  rir: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value) || 0),
                })
              }
              className="w-full h-8 rounded-md border border-input bg-background px-2 text-center text-sm font-medium tabular-nums transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />

            {/* Rest (seconds) */}
            <div className="relative">
              <input
                type="number"
                min={0}
                step={15}
                placeholder="—"
                value={row.restSeconds ?? ""}
                onChange={(e) =>
                  update(row._key, {
                    restSeconds:
                      e.target.value === "" ? null : Math.max(0, parseInt(e.target.value) || 0),
                  })
                }
                className="w-full h-8 rounded-md border border-input bg-background px-2 pb-0.5 text-center text-sm font-medium tabular-nums transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {row.restSeconds && <span className="absolute right-1.5 bottom-1 text-[9px] font-semibold text-muted-foreground/50 pointer-events-none">s</span>}
            </div>

            {/* Delete */}
            <button
              onClick={() => remove(row._key)}
              className="group flex items-center justify-center h-8 w-8 ml-auto rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors focus:outline-none focus:ring-2 focus:ring-destructive/40"
              aria-label="Remove exercise"
            >
              <Trash2 className="h-[14px] w-[14px] opacity-70 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        ))}
      </div>

      {showPicker ? (
        <div className="pt-2 animate-in slide-in-from-top-2 fade-in duration-200">
          <ExercisePicker
            onSelect={addExercise}
            onCancel={() => setShowPicker(false)}
          />
        </div>
      ) : (
        <Button
          variant="dashed"
          size="sm"
          onClick={() => setShowPicker(true)}
          className="w-full mt-2"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add exercise
        </Button>
      )}
    </div>
  );
}

// ─── Cardio Editor ────────────────────────────────────────────────────────────

function CardioEditor({
  rows,
  onChange,
}: {
  rows: CardioRow[];
  onChange: (rows: CardioRow[]) => void;
}) {
  const update = (key: string, patch: Partial<CardioRow>) => {
    onChange(rows.map((r) => (r._key === key ? { ...r, ...patch } : r)));
  };

  const remove = (key: string) => {
    onChange(rows.filter((r) => r._key !== key));
  };

  const addRow = () => {
    onChange([...rows, { _key: uid(), name: "", zone: null, kilometers: null }]);
  };

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <div className="grid grid-cols-[1fr_56px_72px_36px] gap-x-2 px-2 pb-1 bg-muted/30 rounded-t-md pt-2 border-b border-border">
          {["Activity", "Zone", "km", ""].map((h) => (
            <span
              key={h}
              className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center first:text-left"
            >
              {h}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row._key}
            className="grid grid-cols-[1fr_56px_72px_36px] gap-x-2 items-center rounded-lg border border-border bg-card px-2 py-2 shadow-sm transition-all focus-within:border-amber-500/40 focus-within:ring-1 focus-within:ring-amber-500/20"
          >
            <input
              type="text"
              value={row.name}
              onChange={(e) => update(row._key, { name: e.target.value })}
              placeholder="e.g. Easy run"
              className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <div className="relative">
              {row.zone != null && <span className="absolute left-2 top-1.5 text-[10px] font-semibold text-amber-600/50 pointer-events-none">Z</span>}
              <input
                type="number"
                min={1}
                max={5}
                placeholder="—"
                value={row.zone ?? ""}
                onChange={(e) =>
                  update(row._key, {
                    zone:
                      e.target.value === ""
                        ? null
                        : Math.min(5, Math.max(1, parseInt(e.target.value) || 1)),
                  })
                }
                className={cn(
                  "w-full h-8 rounded-md border border-input bg-background text-center text-sm font-medium tabular-nums transition-colors focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500",
                  row.zone != null ? "pl-4" : ""
                )}
              />
            </div>
            <div className="relative">
              <input
                type="number"
                min={0}
                step={0.5}
                placeholder="—"
                value={row.kilometers ?? ""}
                onChange={(e) =>
                  update(row._key, {
                    kilometers:
                      e.target.value === "" ? null : Math.max(0, parseFloat(e.target.value) || 0),
                  })
                }
                className="w-full h-8 rounded-md border border-input bg-background px-2 pb-0.5 pr-5 text-center text-sm font-medium tabular-nums transition-colors focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              {row.kilometers != null && <span className="absolute right-1.5 bottom-1.5 text-[9px] font-semibold text-muted-foreground/50 pointer-events-none">km</span>}
            </div>
            <button
              onClick={() => remove(row._key)}
              className="group flex items-center justify-center h-8 w-8 ml-auto rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors focus:outline-none focus:ring-2 focus:ring-destructive/40"
              aria-label="Remove activity"
            >
              <Trash2 className="h-[14px] w-[14px] opacity-70 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        ))}
      </div>

      <Button
        variant="dashed"
        size="sm"
        onClick={addRow}
        className="w-full mt-2"
      >
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add activity
      </Button>
    </div>
  );
}

// ─── Schedule date helper ─────────────────────────────────────────────────────

/**
 * Returns the YYYY-MM-DD date for a given plan slot (0-based weekIndex, dayIndex)
 * anchored to plan.startDate (or plan.activatedAt for legacy rows).
 * Returns null if the plan has no anchor yet (draft).
 */
function getPlanSlotDate(
  plan: Pick<TrainingPlan, "startDate" | "activatedAt" | "microcycleLength">,
  weekIndex0: number,
  dayIndex0: number
): string | null {
  const anchorStr = plan.startDate ?? plan.activatedAt;
  if (!anchorStr) return null;
  const anchor = plan.startDate
    ? new Date(plan.startDate + "T00:00:00")
    : new Date(anchorStr);
  const offset = weekIndex0 * plan.microcycleLength + dayIndex0;
  const slotDate = new Date(anchor.getTime() + offset * 86_400_000);
  return slotDate.toISOString().slice(0, 10);
}

/**
 * Formats a YYYY-MM-DD string as a short human label, e.g. "Fri Mar 13".
 */
function formatSlotDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ─── Day Cell ─────────────────────────────────────────────────────────────────

function DayCell({
  day,
  templates,
  cardioTemplates,
  planId,
  micId,
  isLocked,
  compact = false,
  scheduledDate,
  onNavigateToDay,
}: {
  day: PlanDay;
  templates: Template[];
  cardioTemplates: CardioTemplate[];
  planId: string;
  micId: string;
  isLocked: boolean;
  compact?: boolean;
  scheduledDate?: string | null;
  onNavigateToDay?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const hasStrength = day.type === "training" && day.workoutTemplateId;
  const hasCardio = day.type === "training" && day.cardioTemplateId;
  const hasAny = hasStrength || hasCardio;

  const strengthName = hasStrength
    ? (templates.find((t) => t.id === day.workoutTemplateId)?.name ?? "Strength")
    : null;
  const cardioName = hasCardio
    ? (cardioTemplates.find((t) => t.id === day.cardioTemplateId)?.name ?? "Cardio")
    : null;

  const saveDayMutation = useMutation({
    mutationFn: (type: DayType) =>
      api.put(`/plans/${planId}/microcycles/${micId}/days/${day.dayNumber}`, {
        type,
        workoutTemplateId: type === "training" ? day.workoutTemplateId : null,
        cardioTemplateId: type === "training" ? day.cardioTemplateId : null,
        notes: day.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan", planId] });
      setOpen(false);
    },
  });

  const handleClick = () => {
    if (day.type === "training") {
      onNavigateToDay?.();
    } else if (!isLocked) {
      setOpen((v) => !v);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        className={cn(
          "w-full rounded-lg border text-left transition-colors",
          compact ? "p-1.5 min-h-[52px]" : "p-2 min-h-[68px]",
          hasAny
            ? "border-primary/30 bg-primary/5 hover:bg-primary/10"
            : day.type === "rest"
            ? "border-dashed border-border bg-muted/30 hover:bg-muted/50"
            : "border-dashed border-border hover:bg-muted/40",
          isLocked && day.type !== "training" && "cursor-default opacity-70"
        )}
        aria-label={`Day ${day.dayNumber}`}
      >
        <span className="block text-[10px] text-muted-foreground mb-0.5">
          D{day.dayNumber}
          {scheduledDate && (
            <span className="block text-[9px] leading-tight opacity-70">
              {formatSlotDate(scheduledDate)}
            </span>
          )}
        </span>

        {day.type !== "training" ? (
          <span
            className={cn(
              "block text-muted-foreground leading-tight",
              compact ? "text-[10px]" : "text-xs"
            )}
          >
            {DAY_TYPE_LABELS[day.type]}
          </span>
        ) : hasStrength || hasCardio ? (
          <div className="space-y-0.5">
            {strengthName && (
              <span
                className={cn(
                  "flex items-center gap-0.5 font-medium leading-tight text-primary",
                  compact ? "text-[10px]" : "text-xs"
                )}
              >
                <Dumbbell className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
                <span className="truncate">{strengthName}</span>
              </span>
            )}
            {cardioName && (
              <span
                className={cn(
                  "flex items-center gap-0.5 font-medium leading-tight text-amber-600 dark:text-amber-400",
                  compact ? "text-[10px]" : "text-xs"
                )}
              >
                <Activity className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
                <span className="truncate">{cardioName}</span>
              </span>
            )}
          </div>
        ) : (
          <span
            className={cn(
              "block text-muted-foreground/60 leading-tight",
              compact ? "text-[10px]" : "text-xs"
            )}
          >
            + assign
          </span>
        )}

        {isLocked && (
          <Check className="h-3 w-3 text-emerald-500 absolute top-1.5 right-1.5" />
        )}
      </button>

      {/* Rest-day quick toggle popover */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute z-50 top-full mt-1 left-0 rounded-xl border border-border bg-card shadow-xl p-3 space-y-2 min-w-[160px]">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Day {day.dayNumber}
            </p>
            <div className="grid grid-cols-2 gap-1">
              {(["training", "rest"] as DayType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => saveDayMutation.mutate(t)}
                  disabled={saveDayMutation.isPending}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-xs font-medium border transition-colors",
                    day.type === t
                      ? DAY_TYPE_COLORS[t] + " ring-1 ring-inset ring-current"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {DAY_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Plan View (mesocycle grid) ───────────────────────────────────────────────

function PlanView({
  plan,
  templates,
  cardioTemplates,
  onNavigateToDay,
}: {
  plan: TrainingPlan;
  templates: Template[];
  cardioTemplates: CardioTemplate[];
  onNavigateToDay: (week: number, day: number) => void;
}) {
  const queryClient = useQueryClient();
  const [editingMcId, setEditingMcId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const isLocked = plan.status === "completed";

  const renameMutation = useMutation({
    mutationFn: ({ mcId, name }: { mcId: string; name: string }) =>
      api.patch(`/plans/${plan.id}/microcycles/${mcId}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan", plan.id] });
      setEditingMcId(null);
    },
  });

  const addWeekMutation = useMutation({
    mutationFn: () => api.post(`/plans/${plan.id}/microcycles`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plan", plan.id] }),
  });

  const addDayMutation = useMutation({
    mutationFn: () => api.post(`/plans/${plan.id}/days/extend`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plan", plan.id] }),
  });

  const deleteWeekMutation = useMutation({
    mutationFn: (mcId: string) => api.delete(`/plans/${plan.id}/microcycles/${mcId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plan", plan.id] }),
  });

  const deleteLastDayMutation = useMutation({
    mutationFn: () => api.delete(`/plans/${plan.id}/days/last`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plan", plan.id] }),
  });

  const canDeleteWeek = plan.microcycles.length > 1;
  const canDeleteDay = plan.microcycleLength > 1;

  return (
    <div className="space-y-3">
      {plan.microcycles.map((mc) => {
        const assignedCount = mc.days.filter(
          (d) => d.type !== "training" || d.workoutTemplateId || d.cardioTemplateId
        ).length;
        const totalDays = plan.microcycleLength;
        const complete = assignedCount === totalDays;

        return (
          <div key={mc.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {editingMcId === mc.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => renameMutation.mutate({ mcId: mc.id, name: editingName })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renameMutation.mutate({ mcId: mc.id, name: editingName });
                      if (e.key === "Escape") setEditingMcId(null);
                    }}
                    className="h-7 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                ) : (
                  <button
                    className="text-sm font-semibold hover:text-primary transition-colors"
                    onClick={() => {
                      if (isLocked) return;
                      setEditingMcId(mc.id);
                      setEditingName(mc.name ?? `Week ${mc.position}`);
                    }}
                  >
                    {mc.name ?? `Week ${mc.position}`}
                  </button>
                )}
                {complete && <Badge variant="success">Complete</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {assignedCount}/{totalDays} days set
                </span>
                {!isLocked && canDeleteWeek && (
                  <button
                    onClick={() => deleteWeekMutation.mutate(mc.id)}
                    disabled={deleteWeekMutation.isPending}
                    aria-label={`Delete ${mc.name ?? `Week ${mc.position}`}`}
                    className="rounded-md p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${plan.microcycleLength}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: plan.microcycleLength }, (_, i) => i + 1).map((d) => {
                const day = mc.days.find((pd) => pd.dayNumber === d) ?? {
                  id: `stub-${mc.id}-${d}`,
                  planMicrocycleId: mc.id,
                  dayNumber: d,
                  type: "training" as DayType,
                  workoutTemplateId: null,
                  workoutTemplate: null,
                  cardioTemplateId: null,
                  cardioTemplate: null,
                  notes: null,
                };
                return (
                  <DayCell
                    key={`${mc.id}-${d}`}
                    day={day}
                    templates={templates}
                    cardioTemplates={cardioTemplates}
                    planId={plan.id}
                    micId={mc.id}
                    isLocked={isLocked}
                    compact
                    scheduledDate={
                      plan.status === "active"
                        ? getPlanSlotDate(plan, mc.position - 1, d - 1)
                        : null
                    }
                    onNavigateToDay={() => onNavigateToDay(mc.position, d)}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {!isLocked && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" loading={addWeekMutation.isPending} onClick={() => addWeekMutation.mutate()}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add week
          </Button>
          <Button variant="outline" size="sm" loading={addDayMutation.isPending} onClick={() => addDayMutation.mutate()}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add day to all weeks
          </Button>
          {canDeleteDay && (
            <Button
              variant="outline"
              size="sm"
              loading={deleteLastDayMutation.isPending}
              onClick={() => deleteLastDayMutation.mutate()}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Remove last day
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Read-Only Day Views ──────────────────────────────────────────────────────

function StrengthReadView({ rows }: { rows: StrengthRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic bg-muted/30 p-4 rounded-lg border border-dashed border-border text-center">
        No strength exercises assigned.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div
          key={r._key}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-sm transition-all hover:border-primary/20"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {i + 1}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{r.exerciseName}</p>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider truncate">
                {r.exerciseMuscle}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-y-1 gap-x-2 text-sm sm:justify-end">
            <div className="flex items-baseline gap-1 bg-muted/50 px-2 py-1 rounded-sm">
              <span className="font-semibold tabular-nums text-foreground">{r.sets}</span>
              <span className="text-xs text-muted-foreground">sets</span>
            </div>
            <span className="text-muted-foreground/30 px-1">×</span>
            <div className="flex items-baseline gap-1 bg-muted/50 px-2 py-1 rounded-sm">
              <span className="font-semibold tabular-nums text-foreground">
                {r.repMin === r.repMax ? r.repMin : `${r.repMin}–${r.repMax}`}
              </span>
              <span className="text-xs text-muted-foreground">reps</span>
            </div>
            {r.rir != null && (
              <div className="flex items-baseline gap-1 bg-primary/5 border border-primary/10 px-2 py-1 rounded-sm">
                <span className="text-[10px] font-bold text-primary/70 uppercase">RIR</span>
                <span className="font-semibold tabular-nums text-primary">{r.rir}</span>
              </div>
            )}
            {r.restSeconds != null && (
              <>
                <div className="h-3 w-[1px] bg-border mx-1 hidden sm:block"></div>
                <div className="flex items-center gap-1 text-muted-foreground bg-muted/30 px-2 py-1 rounded-sm">
                  <span className="font-medium tabular-nums text-foreground">{r.restSeconds}s</span>
                  <span className="text-[10px] uppercase">rest</span>
                </div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function CardioReadView({ rows }: { rows: CardioRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic bg-muted/30 p-4 rounded-lg border border-dashed border-border text-center">
        No cardio activities assigned.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => (
        <div
          key={r._key}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-sm transition-all hover:border-amber-500/20"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-xs font-semibold text-amber-600 dark:text-amber-400">
              {i + 1}
            </div>
            <p className="text-sm font-medium truncate">{r.name}</p>
          </div>
          <div className="flex items-center gap-3 text-sm sm:justify-end">
            {r.kilometers != null && (
              <div className="flex items-baseline gap-1 bg-amber-500/5 px-2 py-1 rounded-sm text-amber-900 dark:text-amber-300 border border-amber-500/10">
                <span className="font-semibold tabular-nums">{r.kilometers}</span>
                <span className="text-xs opacity-70">km</span>
              </div>
            )}
            {r.zone != null && (
              <div className="flex h-6 items-center rounded-md bg-amber-500/10 px-2 text-xs font-medium text-amber-700 dark:text-amber-500 border border-amber-500/20">
                Zone {r.zone}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Day View ─────────────────────────────────────────────────────────────────

function DayView({
  plan,
  templates,
  cardioTemplates,
  initialWeek,
  initialDay,
}: {
  plan: TrainingPlan;
  templates: Template[];
  cardioTemplates: CardioTemplate[];
  initialWeek?: number;
  initialDay?: number;
}) {
  const queryClient = useQueryClient();

  const [selectedWeek, setSelectedWeek] = useState(initialWeek ?? plan.microcycles[0]?.position ?? 1);
  const [selectedDay, setSelectedDay] = useState(initialDay ?? 1);

  const mc = plan.microcycles.find((m) => m.position === selectedWeek) ?? plan.microcycles[0];

  const dayData: PlanDay = mc?.days.find((d) => d.dayNumber === selectedDay) ?? {
    id: `stub-${mc?.id}-${selectedDay}`,
    planMicrocycleId: mc?.id ?? "",
    dayNumber: selectedDay,
    type: "training",
    workoutTemplateId: null,
    workoutTemplate: null,
    cardioTemplateId: null,
    cardioTemplate: null,
    notes: null,
  };

  const strengthTemplate = dayData.workoutTemplateId
    ? (templates.find((t) => t.id === dayData.workoutTemplateId) ?? null)
    : null;

  const cardioTemplate = dayData.cardioTemplateId
    ? (cardioTemplates.find((t) => t.id === dayData.cardioTemplateId) ?? null)
    : null;

  const isLocked = plan.status === "completed";

  // ── Local editable state ──────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [dayType, setDayType] = useState<DayType>(dayData.type);
  const [strengthRows, setStrengthRows] = useState<StrengthRow[]>(
    strengthTemplate ? templateToStrengthRows(strengthTemplate) : []
  );
  const [cardioRows, setCardioRows] = useState<CardioRow[]>(
    cardioTemplate ? cardioTemplateToRows(cardioTemplate) : []
  );
  const [isDirty, setIsDirty] = useState(false);

  // Re-init when the selected day changes
  useEffect(() => {
    setIsEditing(false);
    setDayType(dayData.type);
    setStrengthRows(strengthTemplate ? templateToStrengthRows(strengthTemplate) : []);
    setCardioRows(cardioTemplate ? cardioTemplateToRows(cardioTemplate) : []);
    setIsDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek, selectedDay, plan]);

  const markDirty = () => setIsDirty(true);

  const cancelEdit = () => {
    setIsEditing(false);
    setDayType(dayData.type);
    setStrengthRows(strengthTemplate ? templateToStrengthRows(strengthTemplate) : []);
    setCardioRows(cardioTemplate ? cardioTemplateToRows(cardioTemplate) : []);
    setIsDirty(false);
  };

  // ── Save logic ─────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async () => {
      // 1. If type changed to rest, clear templates and save day
      if (dayType === "rest") {
        await api.put(`/plans/${plan.id}/microcycles/${mc?.id}/days/${dayData.dayNumber}`, {
          type: "rest",
          workoutTemplateId: null,
          cardioTemplateId: null,
          notes: dayData.notes,
        });
        return;
      }

      // 2. Save strength template (upsert)
      let workoutTemplateId = dayData.workoutTemplateId;
      const strengthPayload = {
        name: strengthTemplate?.name ?? `W${selectedWeek} D${selectedDay} Strength`,
        description: null,
        exercises: strengthRows.map((r, i) => ({
          exerciseId: r.exerciseId,
          order: i + 1,
          targetSets: r.sets,
          targetRepMin: r.repMin,
          targetRepMax: r.repMax,
          rir: r.rir ?? null,
          restSeconds: r.restSeconds ?? null,
        })),
      };

      if (strengthRows.length > 0) {
        if (workoutTemplateId) {
          await api.put(`/templates/${workoutTemplateId}`, strengthPayload);
        } else {
          const created: Template = await api.post("/templates", strengthPayload);
          workoutTemplateId = created.id;
        }
      } else {
        workoutTemplateId = null;
      }

      // 3. Save cardio template (upsert)
      let cardioTemplateId = dayData.cardioTemplateId;
      const cardioPayload = {
        name: cardioTemplate?.name ?? `W${selectedWeek} D${selectedDay} Cardio`,
        description: null,
        exercises: cardioRows.map((r, i) => ({
          name: r.name || "Cardio",
          zone: r.zone ?? null,
          kilometers: r.kilometers ?? null,
          order: i + 1,
        })),
      };

      if (cardioRows.length > 0) {
        if (cardioTemplateId) {
          await api.put(`/cardio-templates/${cardioTemplateId}`, cardioPayload);
        } else {
          const created: CardioTemplate = await api.post("/cardio-templates", cardioPayload);
          cardioTemplateId = created.id;
        }
      } else {
        cardioTemplateId = null;
      }

      // 4. Link templates to the plan day
      await api.put(`/plans/${plan.id}/microcycles/${mc?.id}/days/${dayData.dayNumber}`, {
        type: "training",
        workoutTemplateId: workoutTemplateId ?? null,
        cardioTemplateId: cardioTemplateId ?? null,
        notes: dayData.notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan", plan.id] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.invalidateQueries({ queryKey: ["cardio-templates"] });
      setIsDirty(false);
      setIsEditing(false);
    },
  });

  return (
    <div className="space-y-4">
      {/* Week picker */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Week</p>
        <div className="flex flex-wrap gap-1.5">
          {plan.microcycles.map((m) => (
            <button
              key={m.id}
              onClick={() => { setSelectedWeek(m.position); setSelectedDay(1); }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium border transition-colors",
                selectedWeek === m.position
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              W{m.position}
              {m.name && (
                <span className="hidden sm:inline ml-1 text-xs opacity-70">· {m.name}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Day picker */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Day</p>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: plan.microcycleLength }, (_, i) => i + 1).map((d) => {
            const day = mc?.days.find((pd) => pd.dayNumber === d);
            const isRest = day?.type === "rest";
            return (
              <button
                key={d}
                onClick={() => setSelectedDay(d)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium border transition-colors",
                  selectedDay === d
                    ? "bg-primary text-primary-foreground border-primary"
                    : isRest
                    ? "border-dashed border-border text-muted-foreground/60 hover:bg-muted"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                D{d}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day detail panel */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">
              Week {selectedWeek} · Day {selectedDay}
            </span>
            {plan.status === "active" && (() => {
              const d = getPlanSlotDate(plan, selectedWeek - 1, selectedDay - 1);
              return d ? (
                <span className="text-xs text-muted-foreground">{formatSlotDate(d)}</span>
              ) : null;
            })()}
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border",
                DAY_TYPE_COLORS[isEditing ? dayType : dayData.type]
              )}
            >
              {DAY_TYPE_LABELS[isEditing ? dayType : dayData.type]}
            </span>
          </div>

          {!isLocked && (
            isEditing ? (
              <Button size="sm" variant="outline" onClick={cancelEdit}>
                <X className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
            )
          )}
        </div>

        {/* Content */}
        {(isEditing ? dayType : dayData.type) === "rest" ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">Rest day — no workout</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Day type toggle — only visible while editing */}
            {isEditing && (
              <div className="flex gap-1">
                {(["training", "rest"] as DayType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setDayType(t); markDirty(); }}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium border transition-colors",
                      dayType === t
                        ? DAY_TYPE_COLORS[t] + " ring-1 ring-inset ring-current"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {DAY_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            )}

            {/* Strength box */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Dumbbell className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                  Strength
                </span>
              </div>
              {!isEditing ? (
                <StrengthReadView rows={strengthRows} />
              ) : (
                <StrengthEditor
                  rows={strengthRows}
                  onChange={(r) => { setStrengthRows(r); markDirty(); }}
                />
              )}
            </div>

            {/* Cardio box */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                  Cardio
                </span>
              </div>
              {!isEditing ? (
                <CardioReadView rows={cardioRows} />
              ) : (
                <CardioEditor
                  rows={cardioRows}
                  onChange={(r) => { setCardioRows(r); markDirty(); }}
                />
              )}
            </div>
          </div>
        )}

        {/* Save bar — only visible while editing */}
        {isEditing && (
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
            {saveMutation.isError && (
              <p className="text-xs text-destructive">Save failed — try again.</p>
            )}
            {!saveMutation.isError && (
              <span className="text-xs text-muted-foreground">
                {isDirty ? "Unsaved changes" : saveMutation.isSuccess ? "Saved" : ""}
              </span>
            )}
            <Button
              size="sm"
              loading={saveMutation.isPending}
              disabled={!isDirty}
              onClick={() => saveMutation.mutate()}
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              Save
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Plan Adherence Card ─────────────────────────────────────────────────────

interface AdherenceWeek {
  weekIndex: number;
  planned: number;
  completed: number;
  skipped: number;
  missed: number;
}

interface Adherence {
  completionRate: number;
  currentStreak: number;
  longestStreak: number;
  totalVolume: { sets: number; reps: number; weightKg: number };
  weeks: AdherenceWeek[];
}

function PlanAdherenceCard() {
  const { data: adherence, isLoading } = useQuery<Adherence | null>({
    queryKey: ["planAdherence"],
    queryFn: () => api.get("/plans/active/adherence"),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground animate-pulse">
        Loading adherence…
      </div>
    );
  }

  if (!adherence) return null;

  const pct = Math.round(adherence.completionRate * 100);
  const hasData = adherence.weeks.some((w) => w.planned > 0);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Plan Adherence</h3>
      </div>

      {/* Key stats row */}
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

      {/* Volume detail */}
      {adherence.totalVolume.sets > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Weight className="h-3.5 w-3.5" />
          <span>
            {adherence.totalVolume.reps.toLocaleString()} reps ·{" "}
            {adherence.totalVolume.weightKg.toLocaleString()} kg total volume
          </span>
        </div>
      )}

      {/* Per-week breakdown */}
      {hasData && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-x-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            <span>Wk</span>
            <span className="text-center">Planned</span>
            <span className="text-center text-emerald-600 dark:text-emerald-400">Done</span>
            <span className="text-center text-amber-600 dark:text-amber-400">Skip</span>
            <span className="text-center text-destructive/70">Miss</span>
          </div>
          {adherence.weeks
            .filter((w) => w.planned > 0)
            .map((w) => (
              <div
                key={w.weekIndex}
                className="grid grid-cols-[auto_1fr_1fr_1fr_1fr] gap-x-2 items-center rounded-md bg-muted/30 px-2 py-1.5 text-sm"
              >
                <span className="text-xs font-semibold text-muted-foreground w-6">
                  W{w.weekIndex + 1}
                </span>
                <span className="text-center tabular-nums">{w.planned}</span>
                <span className="text-center tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                  {w.completed}
                </span>
                <span className="text-center tabular-nums text-amber-600 dark:text-amber-400">
                  {w.skipped}
                </span>
                <span className="text-center tabular-nums text-destructive/70">
                  {w.missed}
                </span>
              </div>
            ))}
        </div>
      )}

      {!hasData && (
        <p className="text-xs text-muted-foreground text-center py-2">
          No data yet — complete your first planned workout to see stats.
        </p>
      )}
    </div>
  );
}

// ─── Plan Status Banner ───────────────────────────────────────────────────────
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function PlanStatusBanner({ plan }: { plan: TrainingPlan }) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [startDate, setStartDate] = useState(todayISO);

  const totalDays = plan.microcycles.length * plan.microcycleLength;
  const assignedDays = plan.microcycles
    .flatMap((mc) => mc.days)
    .filter((d) => d.type !== "training" || d.workoutTemplateId || d.cardioTemplateId).length;

  const pct = totalDays > 0 ? Math.round((assignedDays / totalDays) * 100) : 0;
  const allAssigned = assignedDays === totalDays;

  const finalizeMutation = useMutation({
    mutationFn: () => api.put(`/plans/${plan.id}`, { status: "active", startDate }),
    onSuccess: () => {
      setModalOpen(false);
      setStartDate(todayISO());
      queryClient.invalidateQueries({ queryKey: ["plan", plan.id] });
      queryClient.invalidateQueries({ queryKey: ["activePlan"] });
    },
  });

  if (plan.status === "active") {
    return (
      <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 flex items-center gap-2.5">
        <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
          Active — {assignedDays}/{totalDays} days configured
        </span>
      </div>
    );
  }

  if (plan.status === "completed") {
    return (
      <div className="rounded-lg bg-muted border border-border px-4 py-2.5 flex items-center gap-2">
        <Check className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm text-muted-foreground">Plan completed</span>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg bg-card border border-border px-4 py-3 space-y-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium tabular-nums">{assignedDays}/{totalDays}</span>
            <span className="text-sm text-muted-foreground">
              days configured{allAssigned ? " — ready to activate" : ""}
            </span>
          </div>
          {allAssigned && (
            <Button size="sm" onClick={() => setModalOpen(true)}>
              Activate Plan
            </Button>
          )}
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              allAssigned ? "bg-emerald-500" : "bg-primary"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setStartDate(todayISO()); }}
        title="Set plan start date"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Day 1 of your plan will be scheduled on this date. Each training day
            gets a fixed calendar slot — skipping a day doesn't shift the schedule.
          </p>
          <DatePicker
            label="Start date"
            value={startDate}
            onChange={setStartDate}
            fromDate={new Date()}
          />
          {finalizeMutation.isError && (
            <p className="text-sm text-destructive">
              {finalizeMutation.error instanceof Error
                ? finalizeMutation.error.message
                : "Failed to activate plan. Please try again."}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => { setModalOpen(false); setStartDate(todayISO()); }}
            >
              Cancel
            </Button>
            <Button
              loading={finalizeMutation.isPending}
              onClick={() => finalizeMutation.mutate()}
            >
              Activate
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PlanEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>("mesocycle");
  const [dayViewWeek, setDayViewWeek] = useState<number | undefined>();
  const [dayViewDay, setDayViewDay] = useState<number | undefined>();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const { data: plan, isLoading } = useQuery<TrainingPlan>({
    queryKey: ["plan", id],
    queryFn: () => api.get(`/plans/${id}`),
    enabled: !!id,
  });

  const deletePlanMutation = useMutation({
    mutationFn: () => api.delete(`/plans/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      navigate("/planner", { replace: true });
    },
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["templates"],
    queryFn: () => api.get("/templates"),
  });

  const { data: cardioTemplates = [] } = useQuery<CardioTemplate[]>({
    queryKey: ["cardio-templates"],
    queryFn: () => api.get("/cardio-templates"),
  });

  if (isLoading || !plan) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">
        Loading plan…
      </div>
    );
  }

  const goToDayView = (week: number, day: number) => {
    setDayViewWeek(week);
    setDayViewDay(day);
    setView("daily");
  };

  const views: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
    { key: "mesocycle", label: "Plan", icon: <Layers className="h-4 w-4" /> },
    { key: "daily", label: "Day", icon: <LayoutGrid className="h-4 w-4" /> },
  ];

  return (
    <>
      <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{plan.name}</h1>
          {plan.description && (
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{plan.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {plan.mesocycleLength} week{plan.mesocycleLength !== 1 ? "s" : ""} ·{" "}
            {plan.microcycleLength} days/week
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDeleteModalOpen(true)}
          aria-label="Delete plan"
          className="text-muted-foreground hover:text-destructive shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Status banner */}
      <PlanStatusBanner plan={plan} />

      {/* Adherence metrics — active plans only */}
      {plan.status === "active" && <PlanAdherenceCard />}

      {/* View switcher */}
      <div
        className="inline-flex rounded-lg border border-border bg-muted p-0.5 gap-0.5"
        role="tablist"
        aria-label="Plan view"
      >
        {views.map(({ key, label, icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              view === key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {icon}
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* View content */}
      {view === "mesocycle" && (
        <PlanView
          plan={plan}
          templates={templates}
          cardioTemplates={cardioTemplates}
          onNavigateToDay={goToDayView}
        />
      )}
      {view === "daily" && (
        <DayView
          key={`${dayViewWeek}-${dayViewDay}`}
          plan={plan}
          templates={templates}
          cardioTemplates={cardioTemplates}
          initialWeek={dayViewWeek}
          initialDay={dayViewDay}
        />
      )}
    </div>

    <Modal
      open={deleteModalOpen}
      onClose={() => setDeleteModalOpen(false)}
      title="Delete training plan"
    >
      <p className="text-sm text-muted-foreground mb-6">
        This will permanently delete your training plan and all its data. This action cannot be undone.
      </p>
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={() => deletePlanMutation.mutate()}
          loading={deletePlanMutation.isPending}
        >
          Delete plan
        </Button>
      </div>
    </Modal>
    </>
  );
}
