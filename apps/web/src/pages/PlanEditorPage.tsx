import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
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
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="grid grid-cols-[1fr_44px_44px_44px_44px_36px] gap-x-1 px-1 pb-0.5">
          {["Exercise", "Sets", "Reps", "RIR", "Rest", ""].map((h) => (
            <span
              key={h}
              className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-center first:text-left"
            >
              {h}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-1">
        {rows.map((row) => (
          <div
            key={row._key}
            className="grid grid-cols-[1fr_44px_44px_44px_44px_36px] gap-x-1 items-center rounded-lg border border-border bg-background px-2 py-1.5"
          >
            {/* Exercise name */}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{row.exerciseName}</p>
              <p className="text-[11px] text-muted-foreground truncate">{row.exerciseMuscle}</p>
            </div>

            {/* Sets */}
            <input
              type="number"
              min={1}
              value={row.sets}
              onChange={(e) =>
                update(row._key, { sets: Math.max(1, parseInt(e.target.value) || 1) })
              }
              className="w-full h-7 rounded border border-border bg-background text-center text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
            />

            {/* Reps (min–max shown as two tiny inputs) */}
            <div className="flex items-center gap-0.5">
              <input
                type="number"
                min={1}
                value={row.repMin}
                onChange={(e) =>
                  update(row._key, { repMin: Math.max(1, parseInt(e.target.value) || 1) })
                }
                className="w-full h-7 rounded border border-border bg-background text-center text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-muted-foreground text-xs shrink-0">–</span>
              <input
                type="number"
                min={1}
                value={row.repMax}
                onChange={(e) =>
                  update(row._key, { repMax: Math.max(1, parseInt(e.target.value) || 1) })
                }
                className="w-full h-7 rounded border border-border bg-background text-center text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
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
              className="w-full h-7 rounded border border-border bg-background text-center text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
            />

            {/* Rest (seconds) */}
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
              className="w-full h-7 rounded border border-border bg-background text-center text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
            />

            {/* Delete */}
            <button
              onClick={() => remove(row._key)}
              className="flex items-center justify-center h-7 w-7 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Remove exercise"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {showPicker ? (
        <ExercisePicker
          onSelect={addExercise}
          onCancel={() => setShowPicker(false)}
        />
      ) : (
        <button
          onClick={() => setShowPicker(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add exercise
        </button>
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
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="grid grid-cols-[1fr_44px_64px_36px] gap-x-1 px-1 pb-0.5">
          {["Activity", "Zone", "km", ""].map((h) => (
            <span
              key={h}
              className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-center first:text-left"
            >
              {h}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-1">
        {rows.map((row) => (
          <div
            key={row._key}
            className="grid grid-cols-[1fr_44px_64px_36px] gap-x-1 items-center rounded-lg border border-border bg-background px-2 py-1.5"
          >
            <input
              type="text"
              value={row.name}
              onChange={(e) => update(row._key, { name: e.target.value })}
              placeholder="e.g. Easy run"
              className="w-full h-7 rounded border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
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
              className="w-full h-7 rounded border border-border bg-background text-center text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
            />
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
              className="w-full h-7 rounded border border-border bg-background text-center text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={() => remove(row._key)}
              className="flex items-center justify-center h-7 w-7 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Remove activity"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addRow}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add activity
      </button>
    </div>
  );
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
  onNavigateToDay,
}: {
  day: PlanDay;
  templates: Template[];
  cardioTemplates: CardioTemplate[];
  planId: string;
  micId: string;
  isLocked: boolean;
  compact?: boolean;
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
                strengthRows.length > 0 ? (
                  <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                    {strengthRows.map((r) => (
                      <div
                        key={r._key}
                        className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 items-center px-3 py-2.5 bg-background"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{r.exerciseName}</p>
                          <p className="text-[11px] text-muted-foreground">{r.exerciseMuscle}</p>
                        </div>
                        <span className="text-sm tabular-nums text-center w-8">{r.sets}</span>
                        <span className="text-sm tabular-nums text-center w-14">
                          {r.repMin === r.repMax ? r.repMin : `${r.repMin}–${r.repMax}`}
                        </span>
                        {r.rir != null && (
                          <span className="text-sm tabular-nums text-center w-10 text-muted-foreground">
                            RIR {r.rir}
                          </span>
                        )}
                        <span className="text-sm tabular-nums text-center w-12 text-muted-foreground">
                          {r.restSeconds ? `${r.restSeconds}s` : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No strength exercises assigned.</p>
                )
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
                cardioRows.length > 0 ? (
                  <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                    {cardioRows.map((r) => (
                      <div
                        key={r._key}
                        className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center px-3 py-2.5 bg-background"
                      >
                        <p className="text-sm font-medium truncate">{r.name}</p>
                        <span className="text-sm tabular-nums text-center w-16 text-muted-foreground">
                          {r.kilometers != null ? `${r.kilometers} km` : "—"}
                        </span>
                        <span className="text-sm tabular-nums text-center w-14 text-muted-foreground">
                          {r.zone != null ? `Z${r.zone}` : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No cardio activities assigned.</p>
                )
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

// ─── Plan Status Banner ───────────────────────────────────────────────────────

function PlanStatusBanner({ plan }: { plan: TrainingPlan }) {
  const queryClient = useQueryClient();

  const totalDays = plan.microcycles.length * plan.microcycleLength;
  const assignedDays = plan.microcycles
    .flatMap((mc) => mc.days)
    .filter((d) => d.type !== "training" || d.workoutTemplateId || d.cardioTemplateId).length;

  const pct = totalDays > 0 ? Math.round((assignedDays / totalDays) * 100) : 0;
  const allAssigned = assignedDays === totalDays;

  const finalizeMutation = useMutation({
    mutationFn: () => api.put(`/plans/${plan.id}`, { status: "active" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plan", plan.id] }),
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
    <div className="rounded-lg bg-card border border-border px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium tabular-nums">{assignedDays}/{totalDays}</span>
          <span className="text-sm text-muted-foreground">
            days configured{allAssigned ? " — ready to activate" : ""}
          </span>
        </div>
        {allAssigned && (
          <Button size="sm" loading={finalizeMutation.isPending} onClick={() => finalizeMutation.mutate()}>
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
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PlanEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewMode>("mesocycle");
  const [dayViewWeek, setDayViewWeek] = useState<number | undefined>();
  const [dayViewDay, setDayViewDay] = useState<number | undefined>();

  const { data: plan, isLoading } = useQuery<TrainingPlan>({
    queryKey: ["plan", id],
    queryFn: () => api.get(`/plans/${id}`),
    enabled: !!id,
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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/planner")} aria-label="Back to planner">
          <ArrowLeft className="h-4 w-4" />
        </Button>
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
      </div>

      {/* Status banner */}
      <PlanStatusBanner plan={plan} />

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
  );
}
