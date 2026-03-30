import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  Save,
  X,
  Plus,
  Search,
  Dumbbell,
  Activity,
  GripVertical,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MUSCLE_LABELS, muscleLabel } from "@/lib/muscleLabels";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Exercise {
  id: string;
  name: string;
  primaryMuscle: string;
}

interface TemplateExercise {
  id: string;
  order: number;
  targetSets: number;
  targetRepMin: number;
  targetRepMax: number;
  rir: number | null;
  restSeconds: number | null;
  exercise: { id: string; name: string; primaryMuscle: string };
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

interface TrainingPlan {
  id: string;
  name: string;
  status: "draft" | "active" | "completed";
  microcycleLength: number;
  startDate: string | null;
  activatedAt: string | null;
  microcycles: Array<{
    id: string;
    position: number;
    name: string | null;
    days: PlanDay[];
  }>;
}

type DayType = "training" | "rest";

// ─── Row types ────────────────────────────────────────────────────────────────

interface StrengthRow {
  _key: string;
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

// ─── Exercise picker ──────────────────────────────────────────────────────────

function ExercisePicker({
  onSelect,
  onCancel,
}: {
  onSelect: (ex: Exercise) => void;
  onCancel: () => void;
}) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { data: allExercises = [], isLoading } = useQuery<Exercise[]>({
    queryKey: ["exercises"],
    queryFn: () => api.get("/exercises"),
    staleTime: Infinity,
  });

  const results = search
    ? allExercises.filter((ex) => {
        const q = search.toLowerCase();
        return (
          ex.name.toLowerCase().includes(q) ||
          ex.primaryMuscle.toLowerCase().includes(q) ||
          (MUSCLE_LABELS[ex.primaryMuscle] ?? "").toLowerCase().includes(q)
        );
      })
    : allExercises;

  return (
    <div className="rounded-lg border border-border bg-card shadow-lg w-full">
      <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-border">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises…"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button onClick={onCancel} className="p-0.5 rounded hover:bg-muted">
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
      <ul className="max-h-56 overflow-y-auto divide-y divide-border">
        {isLoading && <li className="px-3 py-2 text-xs text-muted-foreground">Loading…</li>}
        {!isLoading && results.length === 0 && (
          <li className="px-3 py-2 text-xs text-muted-foreground">No results</li>
        )}
        {results.map((ex) => (
          <li key={ex.id}>
            <button
              onClick={() => onSelect(ex)}
              className="w-full text-left px-3 py-2 hover:bg-muted transition-colors"
            >
              <p className="text-sm font-medium">{ex.name}</p>
              <p className="text-[11px] text-muted-foreground">{muscleLabel(ex.primaryMuscle)}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Sortable strength row ────────────────────────────────────────────────────

function SortableStrengthRow({
  row,
  disabled,
  onUpdate,
  onRemove,
}: {
  row: StrengthRow;
  disabled?: boolean;
  onUpdate: (patch: Partial<StrengthRow>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row._key,
    disabled: !!disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "grid grid-cols-[20px_1fr_52px_90px_52px_64px_32px] gap-x-2 items-center rounded-lg border border-border bg-card px-2 py-2 shadow-sm",
        isDragging && "opacity-30",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        tabIndex={-1}
        aria-label="Drag to reorder"
        className="flex items-center justify-center h-8 w-5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <div className="min-w-0 pr-1">
        <p className="text-sm font-semibold truncate leading-tight mb-0.5">{row.exerciseName}</p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
          {muscleLabel(row.exerciseMuscle)}
        </p>
      </div>

      <input
        type="number"
        min={1}
        value={row.sets}
        disabled={disabled}
        onChange={(e) => onUpdate({ sets: Math.max(1, parseInt(e.target.value) || 1) })}
        className="h-8 w-full rounded-md border border-input bg-background px-1 text-center text-sm tabular-nums focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
      />

      <div className="flex items-center gap-1">
        <input
          type="number"
          min={1}
          value={row.repMin}
          disabled={disabled}
          onChange={(e) => onUpdate({ repMin: Math.max(1, parseInt(e.target.value) || 1) })}
          className="h-8 w-full rounded-md border border-input bg-background p-0 text-center text-sm tabular-nums focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
        <span className="text-muted-foreground/60 text-xs shrink-0">–</span>
        <input
          type="number"
          min={1}
          value={row.repMax}
          disabled={disabled}
          onChange={(e) => onUpdate({ repMax: Math.max(1, parseInt(e.target.value) || 1) })}
          className="h-8 w-full rounded-md border border-input bg-background p-0 text-center text-sm tabular-nums focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
      </div>

      <input
        type="number"
        min={0}
        placeholder="—"
        value={row.rir ?? ""}
        disabled={disabled}
        onChange={(e) =>
          onUpdate({
            rir: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value) || 0),
          })
        }
        className="h-8 w-full rounded-md border border-input bg-background px-1 text-center text-sm tabular-nums focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
      />

      <div className="relative">
        <input
          type="number"
          min={0}
          step={15}
          placeholder="—"
          value={row.restSeconds ?? ""}
          disabled={disabled}
          onChange={(e) =>
            onUpdate({
              restSeconds:
                e.target.value === "" ? null : Math.max(0, parseInt(e.target.value) || 0),
            })
          }
          className="h-8 w-full rounded-md border border-input bg-background px-1 pb-0.5 text-center text-sm tabular-nums focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
        {row.restSeconds != null && (
          <span className="absolute right-1 bottom-1 text-[9px] font-semibold text-muted-foreground/50 pointer-events-none">
            s
          </span>
        )}
      </div>

      <button
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remove"
        className="group flex items-center justify-center h-8 w-8 ml-auto rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Sortable cardio row ──────────────────────────────────────────────────────

function SortableCardioRow({
  row,
  disabled,
  onUpdate,
  onRemove,
}: {
  row: CardioRow;
  disabled?: boolean;
  onUpdate: (patch: Partial<CardioRow>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row._key,
    disabled: !!disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "grid grid-cols-[20px_1fr_52px_68px_32px] gap-x-2 items-center rounded-lg border border-border bg-card px-2 py-2 shadow-sm",
        isDragging && "opacity-30",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        tabIndex={-1}
        aria-label="Drag to reorder"
        className="flex items-center justify-center h-8 w-5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <input
        type="text"
        value={row.name}
        disabled={disabled}
        onChange={(e) => onUpdate({ name: e.target.value })}
        placeholder="e.g. Easy run"
        className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
      />

      <div className="relative">
        {row.zone != null && (
          <span className="absolute left-1.5 top-1.5 text-[10px] font-semibold text-amber-600/50 pointer-events-none">
            Z
          </span>
        )}
        <input
          type="number"
          min={1}
          max={5}
          placeholder="—"
          value={row.zone ?? ""}
          disabled={disabled}
          onChange={(e) =>
            onUpdate({
              zone:
                e.target.value === ""
                  ? null
                  : Math.min(5, Math.max(1, parseInt(e.target.value) || 1)),
            })
          }
          className={cn(
            "h-8 w-full rounded-md border border-input bg-background text-center text-sm tabular-nums focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50",
            row.zone != null ? "pl-4" : "",
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
          disabled={disabled}
          onChange={(e) =>
            onUpdate({
              kilometers:
                e.target.value === "" ? null : Math.max(0, parseFloat(e.target.value) || 0),
            })
          }
          className="h-8 w-full rounded-md border border-input bg-background px-1 pb-0.5 pr-5 text-center text-sm tabular-nums focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
        />
        {row.kilometers != null && (
          <span className="absolute right-1 bottom-1.5 text-[9px] font-semibold text-muted-foreground/50 pointer-events-none">
            km
          </span>
        )}
      </div>

      <button
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remove"
        className="group flex items-center justify-center h-8 w-8 ml-auto rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function PlanDayEditorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const routeState = location.state as {
    planId: string;
    microcycleId: string;
    dayNumber: number;
    weekIndex: number;
    dayIndex: number;
  } | null;

  // Redirect back if opened without required state
  useEffect(() => {
    if (!routeState?.planId) navigate("/plan", { replace: true });
  }, [routeState, navigate]);

  const { planId, microcycleId, dayNumber, weekIndex } = routeState ?? {
    planId: "",
    microcycleId: "",
    dayNumber: 1,
    weekIndex: 0,
    dayIndex: 0,
  };

  const { data: plan, isLoading: planLoading } = useQuery<TrainingPlan>({
    queryKey: ["plan-day-editor", planId],
    queryFn: () => api.get(`/plans/${planId}`),
    enabled: !!planId,
  });

  const mc = plan?.microcycles.find((m) => m.id === microcycleId);
  const dayData: PlanDay | undefined = mc?.days.find((d) => d.dayNumber === dayNumber);

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["templates"],
    queryFn: () => api.get("/templates"),
    enabled: !!planId,
  });

  const { data: cardioTemplates = [] } = useQuery<CardioTemplate[]>({
    queryKey: ["cardio-templates"],
    queryFn: () => api.get("/cardio-templates"),
    enabled: !!planId,
  });

  // Resolve templates — prefer embedded data on the day (most current)
  const strengthTemplate: Template | null = dayData
    ? (dayData.workoutTemplate ??
      (dayData.workoutTemplateId
        ? (templates.find((t) => t.id === dayData.workoutTemplateId) ?? null)
        : null))
    : null;

  const cardioTemplate: CardioTemplate | null = dayData
    ? (dayData.cardioTemplate ??
      (dayData.cardioTemplateId
        ? (cardioTemplates.find((t) => t.id === dayData.cardioTemplateId) ?? null)
        : null))
    : null;

  // ── Editable state ──────────────────────────────────────────────────────────

  const [dayType, setDayType] = useState<DayType>(() => dayData?.type ?? "training");
  const [strengthRows, setStrengthRows] = useState<StrengthRow[]>(() =>
    strengthTemplate ? templateToStrengthRows(strengthTemplate) : [],
  );
  const [cardioRows, setCardioRows] = useState<CardioRow[]>(() =>
    cardioTemplate ? cardioTemplateToRows(cardioTemplate) : [],
  );
  const [strengthName, setStrengthName] = useState(
    () => strengthTemplate?.name ?? `W${weekIndex + 1} D${dayNumber} Strength`,
  );
  const [cardioName, setCardioName] = useState(
    () => cardioTemplate?.name ?? `W${weekIndex + 1} D${dayNumber} Cardio`,
  );
  const [isDirty, setIsDirty] = useState(false);
  const [showStrengthPicker, setShowStrengthPicker] = useState(false);

  // Re-init editable state once when async plan data first arrives.
  // Calling setState during render (not in an effect) is the React-recommended
  // pattern for "adjusting state on prop/data change" — it avoids the
  // cascading-render lint warning that useEffect + setState triggers.
  const [seenDayData, setSeenDayData] = useState(dayData);
  if (seenDayData !== dayData && dayData && !isDirty) {
    setSeenDayData(dayData);
    setDayType(dayData.type);
    setStrengthRows(strengthTemplate ? templateToStrengthRows(strengthTemplate) : []);
    setCardioRows(cardioTemplate ? cardioTemplateToRows(cardioTemplate) : []);
    setStrengthName(strengthTemplate?.name ?? `W${weekIndex + 1} D${dayNumber} Strength`);
    setCardioName(cardioTemplate?.name ?? `W${weekIndex + 1} D${dayNumber} Cardio`);
  }

  const mark = () => setIsDirty(true);

  // ── DnD for strength rows ───────────────────────────────────────────────────

  const [activeStrengthKey, setActiveStrengthKey] = useState<string | null>(null);
  const [activeCardioKey, setActiveCardioKey] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  // ── Save mutation ───────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (dayType === "rest") {
        await api.put(`/plans/${planId}/microcycles/${microcycleId}/days/${dayNumber}`, {
          type: "rest",
          workoutTemplateId: null,
          cardioTemplateId: null,
          notes: dayData?.notes ?? null,
        });
        return;
      }

      let workoutTemplateId = dayData?.workoutTemplateId ?? null;

      if (strengthRows.length > 0) {
        const payload = {
          name: strengthName.trim() || `W${weekIndex + 1} D${dayNumber} Strength`,
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
        if (workoutTemplateId) {
          await api.put(`/templates/${workoutTemplateId}`, payload);
        } else {
          const created: Template = await api.post("/templates", payload);
          workoutTemplateId = created.id;
        }
      } else if (workoutTemplateId) {
        try {
          await api.delete(`/templates/${workoutTemplateId}`);
        } catch {
          /* non-fatal */
        }
        workoutTemplateId = null;
      }

      let cardioTemplateId = dayData?.cardioTemplateId ?? null;

      if (cardioRows.length > 0) {
        const payload = {
          name: cardioName.trim() || `W${weekIndex + 1} D${dayNumber} Cardio`,
          description: null,
          exercises: cardioRows.map((r, i) => ({
            name: r.name || "Cardio",
            zone: r.zone ?? null,
            kilometers: r.kilometers ?? null,
            order: i + 1,
          })),
        };
        if (cardioTemplateId) {
          await api.put(`/cardio-templates/${cardioTemplateId}`, payload);
        } else {
          const created: CardioTemplate = await api.post("/cardio-templates", payload);
          cardioTemplateId = created.id;
        }
      } else if (cardioTemplateId) {
        try {
          await api.delete(`/cardio-templates/${cardioTemplateId}`);
        } catch {
          /* non-fatal */
        }
        cardioTemplateId = null;
      }

      await api.put(`/plans/${planId}/microcycles/${microcycleId}/days/${dayNumber}`, {
        type: "training",
        workoutTemplateId: workoutTemplateId ?? null,
        cardioTemplateId: cardioTemplateId ?? null,
        notes: dayData?.notes ?? null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan-day-editor", planId] });
      queryClient.invalidateQueries({ queryKey: ["plan", planId] });
      queryClient.invalidateQueries({ queryKey: ["activePlan"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.invalidateQueries({ queryKey: ["cardio-templates"] });
      setIsDirty(false);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["plan-day-editor", planId] });
    },
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!routeState?.planId) return null;

  const isLocked = plan?.status === "completed";
  const weekLabel = mc ? (mc.name ?? `Week ${mc.position}`) : `Week ${weekIndex + 1}`;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/plan")}
          aria-label="Back to plan"
          className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight truncate">
            {weekLabel} · Day {dayNumber}
          </h1>
          {plan && <p className="text-xs text-muted-foreground truncate">{plan.name}</p>}
        </div>
      </div>

      {planLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Day type toggle */}
          {!isLocked && (
            <div className="flex gap-2">
              {(["training", "rest"] as DayType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setDayType(t);
                    mark();
                  }}
                  className={cn(
                    "rounded-lg px-4 py-2 text-sm font-medium border transition-colors",
                    dayType === t
                      ? t === "training"
                        ? "bg-primary/10 text-primary border-primary/30"
                        : "bg-muted text-muted-foreground border-border"
                      : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t === "training" ? "Training" : "Rest"}
                </button>
              ))}
            </div>
          )}

          {dayType === "rest" ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">Rest day — no workout assigned</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* ── Strength section ── */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Dumbbell className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-semibold text-primary uppercase tracking-wide">
                    Strength
                  </span>
                  {isLocked ? (
                    <span className="text-xs text-muted-foreground ml-1">— {strengthName}</span>
                  ) : (
                    <input
                      value={strengthName}
                      onChange={(e) => {
                        setStrengthName(e.target.value);
                        mark();
                      }}
                      disabled={saveMutation.isPending}
                      placeholder="Workout name"
                      className="ml-1 h-7 min-w-0 flex-1 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                    />
                  )}
                </div>

                {/* Column headers */}
                {strengthRows.length > 0 && (
                  <div className="grid grid-cols-[20px_1fr_52px_90px_52px_64px_32px] gap-x-2 px-2 pb-1 bg-muted/30 rounded-t-md pt-2 border-b border-border">
                    {["", "Exercise", "Sets", "Reps", "RIR", "Rest", ""].map((h, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center first:text-left"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                )}

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={(e) => setActiveStrengthKey(e.active.id as string)}
                  onDragEnd={(event: DragEndEvent) => {
                    setActiveStrengthKey(null);
                    const { active, over } = event;
                    if (!over || active.id === over.id) return;
                    const oi = strengthRows.findIndex((r) => r._key === active.id);
                    const ni = strengthRows.findIndex((r) => r._key === over.id);
                    if (oi !== -1 && ni !== -1) {
                      setStrengthRows(arrayMove(strengthRows, oi, ni));
                      mark();
                    }
                  }}
                >
                  <SortableContext
                    items={strengthRows.map((r) => r._key)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {strengthRows.map((row) => (
                        <SortableStrengthRow
                          key={row._key}
                          row={row}
                          disabled={isLocked || saveMutation.isPending}
                          onUpdate={(patch) => {
                            setStrengthRows(
                              strengthRows.map((r) =>
                                r._key === row._key ? { ...r, ...patch } : r,
                              ),
                            );
                            mark();
                          }}
                          onRemove={() => {
                            setStrengthRows(strengthRows.filter((r) => r._key !== row._key));
                            mark();
                          }}
                        />
                      ))}
                    </div>
                  </SortableContext>
                  <DragOverlay dropAnimation={null}>
                    {activeStrengthKey &&
                      (() => {
                        const r = strengthRows.find((row) => row._key === activeStrengthKey);
                        return r ? (
                          <div className="grid grid-cols-[20px_1fr_52px_90px_52px_64px_32px] gap-x-2 items-center rounded-lg border border-primary/40 bg-card px-2 py-2 shadow-lg opacity-95">
                            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
                            <p className="text-sm font-semibold truncate">{r.exerciseName}</p>
                            <div />
                            <div />
                            <div />
                            <div />
                            <div />
                          </div>
                        ) : null;
                      })()}
                  </DragOverlay>
                </DndContext>

                {!isLocked &&
                  (showStrengthPicker ? (
                    <div className="pt-1 animate-in slide-in-from-top-2 fade-in duration-200">
                      <ExercisePicker
                        onSelect={(ex) => {
                          setStrengthRows([
                            ...strengthRows,
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
                          setShowStrengthPicker(false);
                          mark();
                        }}
                        onCancel={() => setShowStrengthPicker(false)}
                      />
                    </div>
                  ) : (
                    <Button
                      variant="dashed"
                      size="sm"
                      disabled={saveMutation.isPending}
                      onClick={() => setShowStrengthPicker(true)}
                      className="w-full"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Add exercise
                    </Button>
                  ))}
              </section>

              {/* ── Cardio section ── */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="text-sm font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                    Cardio
                  </span>
                  {isLocked ? (
                    <span className="text-xs text-muted-foreground ml-1">— {cardioName}</span>
                  ) : (
                    <input
                      value={cardioName}
                      onChange={(e) => {
                        setCardioName(e.target.value);
                        mark();
                      }}
                      disabled={saveMutation.isPending}
                      placeholder="Cardio name"
                      className="ml-1 h-7 min-w-0 flex-1 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                    />
                  )}
                </div>

                {cardioRows.length > 0 && (
                  <div className="grid grid-cols-[20px_1fr_52px_68px_32px] gap-x-2 px-2 pb-1 bg-muted/30 rounded-t-md pt-2 border-b border-border">
                    {["", "Activity", "Zone", "km", ""].map((h, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center first:text-left"
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                )}

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={(e) => setActiveCardioKey(e.active.id as string)}
                  onDragEnd={(event: DragEndEvent) => {
                    setActiveCardioKey(null);
                    const { active, over } = event;
                    if (!over || active.id === over.id) return;
                    const oi = cardioRows.findIndex((r) => r._key === active.id);
                    const ni = cardioRows.findIndex((r) => r._key === over.id);
                    if (oi !== -1 && ni !== -1) {
                      setCardioRows(arrayMove(cardioRows, oi, ni));
                      mark();
                    }
                  }}
                >
                  <SortableContext
                    items={cardioRows.map((r) => r._key)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {cardioRows.map((row) => (
                        <SortableCardioRow
                          key={row._key}
                          row={row}
                          disabled={isLocked || saveMutation.isPending}
                          onUpdate={(patch) => {
                            setCardioRows(
                              cardioRows.map((r) => (r._key === row._key ? { ...r, ...patch } : r)),
                            );
                            mark();
                          }}
                          onRemove={() => {
                            setCardioRows(cardioRows.filter((r) => r._key !== row._key));
                            mark();
                          }}
                        />
                      ))}
                    </div>
                  </SortableContext>
                  <DragOverlay dropAnimation={null}>
                    {activeCardioKey &&
                      (() => {
                        const r = cardioRows.find((row) => row._key === activeCardioKey);
                        return r ? (
                          <div className="grid grid-cols-[20px_1fr_52px_68px_32px] gap-x-2 items-center rounded-lg border border-amber-500/40 bg-card px-2 py-2 shadow-lg opacity-95">
                            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
                            <p className="text-sm font-medium truncate">{r.name || "—"}</p>
                            <div />
                            <div />
                            <div />
                          </div>
                        ) : null;
                      })()}
                  </DragOverlay>
                </DndContext>

                {!isLocked && (
                  <Button
                    variant="dashed"
                    size="sm"
                    disabled={saveMutation.isPending}
                    onClick={() => {
                      setCardioRows([
                        ...cardioRows,
                        { _key: uid(), name: "", zone: null, kilometers: null },
                      ]);
                      mark();
                    }}
                    className="w-full"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add activity
                  </Button>
                )}
              </section>
            </div>
          )}

          {/* Save bar */}
          {!isLocked && (
            <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border pt-3 pb-2 flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                {saveMutation.isError ? (
                  <span className="text-destructive">
                    {saveMutation.error instanceof Error
                      ? saveMutation.error.message
                      : "Save failed — try again."}
                  </span>
                ) : isDirty ? (
                  "Unsaved changes"
                ) : saveMutation.isSuccess ? (
                  "Saved"
                ) : (
                  ""
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate("/plan")}>
                  <X className="h-3.5 w-3.5 mr-1" />
                  Cancel
                </Button>
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
