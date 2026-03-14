import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PlannerPage } from "./PlannerPage";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  Trash,
  GripVertical,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
  dayLogs?: Record<string, { workout?: string; cardio?: string }>; // "weekIndex:dayIndex" -> per-component status
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

// ─── Sortable Strength Row ────────────────────────────────────────────────────

function SortableStrengthRow({
  row,
  isEditing,
  disabled,
  onUpdate,
  onRemove,
}: {
  row: StrengthRow;
  isEditing: boolean;
  disabled?: boolean;
  onUpdate: (patch: Partial<StrengthRow>) => void;
  onRemove: () => void;
}) {
  const draggable = isEditing && !disabled;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row._key, disabled: !draggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "grid grid-cols-[20px_1fr_56px_96px_56px_68px_36px] gap-x-2 items-center rounded-lg border border-border bg-card px-2 py-2 shadow-sm transition-all focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20",
        isDragging && "opacity-30"
      )}
    >
      {/* Drag handle */}
      <button
        {...(draggable ? { ...attributes, ...listeners } : {})}
        tabIndex={-1}
        aria-label="Drag to reorder"
        className={cn(
          "flex items-center justify-center h-8 w-5 rounded text-muted-foreground/40 transition-colors touch-none",
          draggable ? "cursor-grab active:cursor-grabbing hover:text-muted-foreground" : "cursor-default"
        )}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

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
        disabled={disabled}
        onChange={(e) => onUpdate({ sets: Math.max(1, parseInt(e.target.value) || 1) })}
        className="w-full h-8 rounded-md border border-input bg-background px-2 text-center text-sm font-medium tabular-nums transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
      />

      {/* Reps */}
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={1}
          value={row.repMin}
          disabled={disabled}
          onChange={(e) => onUpdate({ repMin: Math.max(1, parseInt(e.target.value) || 1) })}
          className="w-full h-8 rounded-md border border-input bg-background p-0 text-center text-sm font-medium tabular-nums transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <span className="text-muted-foreground/60 text-xs font-medium shrink-0">–</span>
        <input
          type="number"
          min={1}
          value={row.repMax}
          disabled={disabled}
          onChange={(e) => onUpdate({ repMax: Math.max(1, parseInt(e.target.value) || 1) })}
          className="w-full h-8 rounded-md border border-input bg-background p-0 text-center text-sm font-medium tabular-nums transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* RIR */}
      <input
        type="number"
        min={0}
        placeholder="—"
        value={row.rir ?? ""}
        disabled={disabled}
        onChange={(e) =>
          onUpdate({ rir: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value) || 0) })
        }
        className="w-full h-8 rounded-md border border-input bg-background px-2 text-center text-sm font-medium tabular-nums transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
      />

      {/* Rest */}
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
              restSeconds: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value) || 0),
            })
          }
          className="w-full h-8 rounded-md border border-input bg-background px-2 pb-0.5 text-center text-sm font-medium tabular-nums transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {row.restSeconds != null && (
          <span className="absolute right-1.5 bottom-1 text-[9px] font-semibold text-muted-foreground/50 pointer-events-none">s</span>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={onRemove}
        disabled={disabled}
        className="group flex items-center justify-center h-8 w-8 ml-auto rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors focus:outline-none focus:ring-2 focus:ring-destructive/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
        aria-label="Remove exercise"
      >
        <Trash2 className="h-[14px] w-[14px] opacity-70 group-hover:opacity-100 transition-opacity" />
      </button>
    </div>
  );
}

// ─── Strength Editor ──────────────────────────────────────────────────────────

function StrengthEditor({
  rows,
  isEditing,
  disabled,
  onChange,
}: {
  rows: StrengthRow[];
  isEditing: boolean;
  disabled?: boolean;
  onChange: (rows: StrengthRow[]) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const activeRow = activeKey != null ? rows.find((r) => r._key === activeKey) ?? null : null;

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveKey(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r._key === active.id);
    const newIndex = rows.findIndex((r) => r._key === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      onChange(arrayMove(rows, oldIndex, newIndex));
    }
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
        <div className="grid grid-cols-[20px_1fr_56px_96px_56px_68px_36px] gap-x-2 px-2 pb-1 bg-muted/30 rounded-t-md pt-2 border-b border-border">
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
        onDragStart={(e) => setActiveKey(e.active.id as string)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={rows.map((r) => r._key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {rows.map((row) => (
              <SortableStrengthRow
                key={row._key}
                row={row}
                isEditing={isEditing}
                disabled={disabled}
                onUpdate={(patch) => onChange(rows.map((r) => (r._key === row._key ? { ...r, ...patch } : r)))}
                onRemove={() => onChange(rows.filter((r) => r._key !== row._key))}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeRow && (
            <div className="grid grid-cols-[20px_1fr_56px_96px_56px_68px_36px] gap-x-2 items-center rounded-lg border border-primary/40 bg-card px-2 py-2 shadow-lg opacity-95">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
              <div className="min-w-0 pr-2">
                <p className="text-sm font-semibold truncate leading-tight mb-0.5">{activeRow.exerciseName}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{activeRow.exerciseMuscle}</p>
              </div>
              <div /><div /><div /><div /><div />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {showPicker ? (
        <div className="pt-2 animate-in slide-in-from-top-2 fade-in duration-200">
          <ExercisePicker
            onSelect={addExercise}
            onCancel={() => setShowPicker(false)}
          />
        </div>
      ) : (
        <Button variant="dashed" size="sm" disabled={disabled} onClick={() => setShowPicker(true)} className="w-full mt-2">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add exercise
        </Button>
      )}
    </div>
  );
}

// ─── Sortable Cardio Row ──────────────────────────────────────────────────────

function SortableCardioRow({
  row,
  isEditing,
  disabled,
  onUpdate,
  onRemove,
}: {
  row: CardioRow;
  isEditing: boolean;
  disabled?: boolean;
  onUpdate: (patch: Partial<CardioRow>) => void;
  onRemove: () => void;
}) {
  const draggable = isEditing && !disabled;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row._key, disabled: !draggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "grid grid-cols-[20px_1fr_56px_72px_36px] gap-x-2 items-center rounded-lg border border-border bg-card px-2 py-2 shadow-sm transition-all focus-within:border-amber-500/40 focus-within:ring-1 focus-within:ring-amber-500/20",
        isDragging && "opacity-30"
      )}
    >
      {/* Drag handle */}
      <button
        {...(draggable ? { ...attributes, ...listeners } : {})}
        tabIndex={-1}
        aria-label="Drag to reorder"
        className={cn(
          "flex items-center justify-center h-8 w-5 rounded text-muted-foreground/40 transition-colors touch-none",
          draggable ? "cursor-grab active:cursor-grabbing hover:text-muted-foreground" : "cursor-default"
        )}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Name */}
      <input
        type="text"
        value={row.name}
        disabled={disabled}
        onChange={(e) => onUpdate({ name: e.target.value })}
        placeholder="e.g. Easy run"
        className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
      />

      {/* Zone */}
      <div className="relative">
        {row.zone != null && (
          <span className="absolute left-2 top-1.5 text-[10px] font-semibold text-amber-600/50 pointer-events-none">Z</span>
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
              zone: e.target.value === "" ? null : Math.min(5, Math.max(1, parseInt(e.target.value) || 1)),
            })
          }
          className={cn(
            "w-full h-8 rounded-md border border-input bg-background text-center text-sm font-medium tabular-nums transition-colors focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed",
            row.zone != null ? "pl-4" : ""
          )}
        />
      </div>

      {/* km */}
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
              kilometers: e.target.value === "" ? null : Math.max(0, parseFloat(e.target.value) || 0),
            })
          }
          className="w-full h-8 rounded-md border border-input bg-background px-2 pb-0.5 pr-5 text-center text-sm font-medium tabular-nums transition-colors focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {row.kilometers != null && (
          <span className="absolute right-1.5 bottom-1.5 text-[9px] font-semibold text-muted-foreground/50 pointer-events-none">km</span>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={onRemove}
        disabled={disabled}
        className="group flex items-center justify-center h-8 w-8 ml-auto rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors focus:outline-none focus:ring-2 focus:ring-destructive/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
        aria-label="Remove activity"
      >
        <Trash2 className="h-[14px] w-[14px] opacity-70 group-hover:opacity-100 transition-opacity" />
      </button>
    </div>
  );
}

// ─── Cardio Editor ────────────────────────────────────────────────────────────

function CardioEditor({
  rows,
  isEditing,
  disabled,
  onChange,
}: {
  rows: CardioRow[];
  isEditing: boolean;
  disabled?: boolean;
  onChange: (rows: CardioRow[]) => void;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const activeRow = activeKey != null ? rows.find((r) => r._key === activeKey) ?? null : null;

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveKey(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r._key === active.id);
    const newIndex = rows.findIndex((r) => r._key === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      onChange(arrayMove(rows, oldIndex, newIndex));
    }
  };

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <div className="grid grid-cols-[20px_1fr_56px_72px_36px] gap-x-2 px-2 pb-1 bg-muted/30 rounded-t-md pt-2 border-b border-border">
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
        onDragStart={(e) => setActiveKey(e.active.id as string)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={rows.map((r) => r._key)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {rows.map((row) => (
              <SortableCardioRow
                key={row._key}
                row={row}
                isEditing={isEditing}
                disabled={disabled}
                onUpdate={(patch) => onChange(rows.map((r) => (r._key === row._key ? { ...r, ...patch } : r)))}
                onRemove={() => onChange(rows.filter((r) => r._key !== row._key))}
              />
            ))}
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeRow && (
            <div className="grid grid-cols-[20px_1fr_56px_72px_36px] gap-x-2 items-center rounded-lg border border-amber-500/40 bg-card px-2 py-2 shadow-lg opacity-95">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
              <p className="text-sm font-medium truncate">{activeRow.name || "—"}</p>
              <div /><div /><div />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <Button variant="dashed" size="sm" disabled={disabled} onClick={() => onChange([...rows, { _key: uid(), name: "", zone: null, kilometers: null }])} className="w-full mt-2">
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
  isDraggable = false,
  isReordering = false,
  scheduledDate,
  status,
  onNavigateToDay,
  isOverlay = false,
}: {
  day: PlanDay;
  templates: Template[];
  cardioTemplates: CardioTemplate[];
  planId: string;
  micId: string;
  isLocked: boolean;
  isDraggable?: boolean;
  isReordering?: boolean;
  scheduledDate?: string | null;
  status?: { workout?: string; cardio?: string } | null;
  onNavigateToDay?: () => void;
  isOverlay?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  // A past day is any scheduled slot strictly before today (only relevant for active plans)
  const isPast = (() => {
    if (!scheduledDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(scheduledDate + "T00:00:00") < today;
  })();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: day.dayNumber, disabled: !isDraggable || isOverlay || isPast });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const hasStrength = day.type === "training" && !!day.workoutTemplateId;
  const hasCardio = day.type === "training" && !!day.cardioTemplateId;
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

  // Clicks on non-training days open the type toggle popover.
  // Clicks on training days navigate into the day editor.
  // We let dnd-kit handle the pointer — it fires onClick only when no drag occurred.
  const handleClick = () => {
    if (isDragging || isReordering || isPast) return;
    if (day.type === "training") {
      onNavigateToDay?.();
    } else if (!isLocked) {
      setOpen((v) => !v);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("relative", isDragging && "opacity-30")}
    >
      <button
        {...(isDraggable ? { ...attributes, ...listeners } : {})}
        onClick={handleClick}
        className={cn(
          "w-full rounded-lg border text-left transition-colors flex flex-col p-1.5 h-[60px] overflow-hidden",
          isDraggable && !isPast && "cursor-grab active:cursor-grabbing touch-none",
          isPast && "cursor-default opacity-60",
          hasAny
            ? cn("border-primary/30 bg-primary/5", !isPast && "hover:bg-primary/10")
            : day.type === "rest"
            ? cn("border-dashed border-border bg-muted/30", !isPast && "hover:bg-muted/50")
            : cn("border-dashed border-border", !isPast && "hover:bg-muted/40"),
          isLocked && day.type !== "training" && "cursor-default opacity-70"
        )}
        aria-label={`Day ${day.dayNumber}`}
      >
        <span className="block text-[10px] text-muted-foreground mb-0.5 leading-none">
          D{day.dayNumber}
          {scheduledDate && (
            <span className="block text-[9px] leading-tight opacity-70">
              {formatSlotDate(scheduledDate)}
            </span>
          )}
          {/* "Missed" for past training days with no log at all */}
          {!status && scheduledDate && day.type === "training" && (day.workoutTemplateId || day.cardioTemplateId) && (() => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return new Date(scheduledDate + "T00:00:00") < today ? (
              <span className="block text-[9px] font-semibold leading-tight text-destructive/70">Missed</span>
            ) : null;
          })()}
        </span>

        {day.type !== "training" ? (
          <span className="block text-[10px] text-muted-foreground leading-tight">
            {DAY_TYPE_LABELS[day.type]}
          </span>
        ) : (
          <div className="space-y-0.5">
            {(() => {
              const ws = status?.workout;
              const label = ws === "workout_skipped" ? "Strength skipped"
                : ws === "workout_completed" ? "Strength done"
                : (strengthName ?? "No Strength");
              const color = ws === "workout_skipped" ? "text-slate-400"
                : ws === "workout_completed" ? "text-emerald-600 dark:text-emerald-400"
                : hasStrength ? "text-primary" : "text-muted-foreground/30";
              return (
                <span className={cn("block text-[10px] font-medium leading-tight truncate", color)}>
                  {label}
                </span>
              );
            })()}
            {(() => {
              const cs = status?.cardio;
              const label = cs === "cardio_skipped" ? "Cardio skipped"
                : cs === "cardio_completed" ? "Cardio done"
                : (cardioName ?? "No Cardio");
              const color = cs === "cardio_skipped" ? "text-slate-400"
                : cs === "cardio_completed" ? "text-emerald-600 dark:text-emerald-400"
                : hasCardio ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/30";
              return (
                <span className={cn("block text-[10px] font-medium leading-tight truncate", color)}>
                  {label}
                </span>
              );
            })()}
          </div>
        )}

        {isLocked && (
          <Check className="h-3 w-3 text-emerald-500 absolute top-1.5 right-1.5" />
        )}
      </button>

      {/* Rest-day quick toggle popover — not available for past days */}
      {open && !isPast && (
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

// ─── Delete Drop Zone ─────────────────────────────────────────────────────────

function DeleteZone({ canDelete }: { canDelete: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: "delete-zone", disabled: !canDelete });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center justify-center gap-2 rounded-xl border-2 border-dashed py-3 transition-all duration-200",
        isOver
          ? "border-destructive bg-destructive/10 text-destructive scale-[1.02]"
          : "border-destructive/40 text-destructive/60",
        !canDelete && "opacity-40"
      )}
    >
      <Trash className="h-4 w-4" />
      <span className="text-sm font-medium">Drop here to delete day</span>
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
  const [activeId, setActiveId] = useState<number | null>(null);

  // Local day order — only committed to the server on Save
  const canonicalOrder = Array.from({ length: plan.microcycleLength }, (_, i) => i + 1);
  const [isReordering, setIsReordering] = useState(false);
  const [localDayOrder, setLocalDayOrder] = useState<number[]>(canonicalOrder);
  // Holds the saved order while the refetch is in-flight, preventing flicker
  const [pendingOrder, setPendingOrder] = useState<number[] | null>(null);

  // Reset local order whenever the server data changes (refetch completed)
  useEffect(() => {
    setLocalDayOrder(Array.from({ length: plan.microcycleLength }, (_, i) => i + 1));
    setPendingOrder(null);
  }, [plan.microcycleLength, plan.id, plan.microcycles]);

  const isLocked = plan.status === "completed";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

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

  const deleteDayMutation = useMutation({
    mutationFn: (dayNumber: number) => api.delete(`/plans/${plan.id}/days/${dayNumber}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan", plan.id] });
      setIsReordering(false);
    },
  });

  const reorderDaysMutation = useMutation({
    mutationFn: (order: number[]) =>
      api.patch(`/plans/${plan.id}/days/reorder`, { order }),
    onMutate: (order: number[]) => {
      // Immediately exit reorder mode and hold the saved order so the grid
      // doesn't flicker back to the stale canonical order during the refetch.
      setPendingOrder(order);
      setIsReordering(false);
    },
    onError: (_err, order) => {
      // Keep pendingOrder so the grid stays at the attempted order while the
      // user decides what to do. Re-enter reorder mode so they can retry or cancel.
      setPendingOrder(order);
      setIsReordering(true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan", plan.id] });
    },
  });

  const canDeleteWeek = plan.microcycles.length > 1;
  const canDeleteDay = localDayOrder.length > 1;
  // Priority: reordering → use localDayOrder; saving in-flight → use pendingOrder; else canonical
  const dayOrder = isReordering ? localDayOrder : (pendingOrder ?? canonicalOrder);

  const handleCancelReorder = () => {
    setIsReordering(false);
    setLocalDayOrder(canonicalOrder);
    setPendingOrder(null);
  };

  const handleSaveReorder = () => {
    reorderDaysMutation.mutate(localDayOrder);
  };

  // Pick the day data for the drag overlay from the first microcycle that has it configured,
  // so the ghost reflects real content rather than always defaulting to week 1.
  const activeDayStub = activeId != null
    ? (() => {
        const mcWithDay = plan.microcycles.find((mc) => mc.days.some((d) => d.dayNumber === activeId));
        if (mcWithDay) {
          return mcWithDay.days.find((d) => d.dayNumber === activeId) ?? null;
        }
        return {
          id: `stub-overlay-${activeId}`,
          planMicrocycleId: plan.microcycles[0]?.id ?? "",
          dayNumber: activeId,
          type: "training" as DayType,
          workoutTemplateId: null,
          workoutTemplate: null,
          cardioTemplateId: null,
          cardioTemplate: null,
          notes: null,
        };
      })()
    : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    if (over.id === "delete-zone" && canDeleteDay) {
      deleteDayMutation.mutate(active.id as number);
      return;
    }

    if (active.id !== over.id) {
      // Prevent dropping onto a past day column
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const overDate = getPlanSlotDate(plan, 0, (over.id as number) - 1);
      if (overDate && new Date(overDate + "T00:00:00") < today) return;

      const oldIndex = localDayOrder.indexOf(active.id as number);
      const newIndex = localDayOrder.indexOf(over.id as number);
      if (oldIndex !== -1 && newIndex !== -1) {
        setLocalDayOrder(arrayMove(localDayOrder, oldIndex, newIndex));
      }
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-3">
        {/* Reorder toolbar */}
        {!isLocked && (
          <div className="flex items-center gap-2">
            {isReordering || reorderDaysMutation.isPending ? (
              <>
                <Button
                  size="sm"
                  loading={reorderDaysMutation.isPending}
                  onClick={handleSaveReorder}
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  Save order
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelReorder}
                  disabled={reorderDaysMutation.isPending}
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setIsReordering(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit order
              </Button>
            )}
          </div>
        )}

        <SortableContext items={dayOrder} strategy={horizontalListSortingStrategy}>
          {plan.microcycles.map((mc) => {
            const assignedCount = mc.days.filter(
              (d) => d.type !== "training" || d.workoutTemplateId || d.cardioTemplateId
            ).length;
            const totalDays = plan.microcycleLength;

            // Week is fully done when every configured training day has a "done" log
            const weekComplete = plan.status === "active" && (() => {
              const trainingDays = mc.days.filter(
                (d) => d.type === "training" && (d.workoutTemplateId || d.cardioTemplateId)
              );
              if (trainingDays.length === 0) return false;
              return trainingDays.every((d) => {
                const s = plan.dayLogs?.[`${mc.position - 1}:${d.dayNumber - 1}`];
                return s && (s.workout === "workout_completed" || s.cardio === "cardio_completed");
              });
            })();

            return (
              <div key={mc.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {editingMcId === mc.id ? (
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => {
                          const original = mc.name ?? `Week ${mc.position}`;
                          if (editingName.trim() && editingName !== original) {
                            renameMutation.mutate({ mcId: mc.id, name: editingName });
                          } else {
                            setEditingMcId(null);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const original = mc.name ?? `Week ${mc.position}`;
                            if (editingName.trim() && editingName !== original) {
                              renameMutation.mutate({ mcId: mc.id, name: editingName });
                            } else {
                              setEditingMcId(null);
                            }
                          }
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
                    {weekComplete && (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
                        Done
                      </span>
                    )}
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

                <div className="overflow-x-auto">
                  <div className="flex gap-1" style={{ minWidth: "max-content" }}>
                    {dayOrder.map((d) => {
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
                        <div key={`${mc.id}-${d}`} className="w-24 shrink-0">
                          <DayCell
                            day={day}
                            templates={templates}
                            cardioTemplates={cardioTemplates}
                            planId={plan.id}
                            micId={mc.id}
                            isLocked={isLocked}
                            isDraggable={isReordering && !isLocked}
                            isReordering={isReordering}
                            scheduledDate={
                              plan.status === "active"
                                ? getPlanSlotDate(plan, mc.position - 1, d - 1)
                                : null
                            }
                            status={
                              plan.status === "active"
                                ? (plan.dayLogs?.[`${mc.position - 1}:${d - 1}`] ?? null)
                                : null
                            }
                            onNavigateToDay={() => onNavigateToDay(mc.position, d)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </SortableContext>

        {/* Delete drop zone — only visible while reordering and dragging */}
        {isReordering && activeId != null && (
          <DeleteZone canDelete={canDeleteDay} />
        )}

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
          </div>
        )}
      </div>

      {/* Drag overlay — renders the ghost cell while dragging */}
      <DragOverlay dropAnimation={null}>
        {activeDayStub && (
          <div className="w-24">
            <DayCell
              day={activeDayStub}
              templates={templates}
              cardioTemplates={cardioTemplates}
              planId={plan.id}
              micId={activeDayStub.planMicrocycleId}
              isLocked={false}
              isDraggable={false}
              isOverlay
              scheduledDate={null}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
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

  // Past days (active plan only) are read-only — the slot has already passed
  const isPast = (() => {
    if (plan.status !== "active") return false;
    const slotDate = getPlanSlotDate(plan, selectedWeek - 1, selectedDay - 1);
    if (!slotDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(slotDate + "T00:00:00") < today;
  })();

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

      // 2. Save strength template (upsert or delete)
      let workoutTemplateId = dayData.workoutTemplateId;

      if (strengthRows.length > 0) {
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
        try {
          if (workoutTemplateId) {
            await api.put(`/templates/${workoutTemplateId}`, strengthPayload);
          } else {
            const created: Template = await api.post("/templates", strengthPayload);
            workoutTemplateId = created.id;
          }
        } catch {
          throw new Error("Failed to save strength workout. Please try again.");
        }
      } else {
        // All exercises removed — delete the orphaned template
        if (workoutTemplateId) {
          try {
            await api.delete(`/templates/${workoutTemplateId}`);
          } catch {
            // Non-fatal: template may already be gone; proceed
          }
        }
        workoutTemplateId = null;
      }

      // 3. Save cardio template (upsert or delete)
      let cardioTemplateId = dayData.cardioTemplateId;

      if (cardioRows.length > 0) {
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
        try {
          if (cardioTemplateId) {
            await api.put(`/cardio-templates/${cardioTemplateId}`, cardioPayload);
          } else {
            const created: CardioTemplate = await api.post("/cardio-templates", cardioPayload);
            cardioTemplateId = created.id;
          }
        } catch {
          throw new Error("Failed to save cardio workout. Please try again.");
        }
      } else {
        // All activities removed — delete the orphaned template
        if (cardioTemplateId) {
          try {
            await api.delete(`/cardio-templates/${cardioTemplateId}`);
          } catch {
            // Non-fatal: template may already be gone; proceed
          }
        }
        cardioTemplateId = null;
      }

      // 4. Link templates to the plan day
      try {
        await api.put(`/plans/${plan.id}/microcycles/${mc?.id}/days/${dayData.dayNumber}`, {
          type: "training",
          workoutTemplateId: workoutTemplateId ?? null,
          cardioTemplateId: cardioTemplateId ?? null,
          notes: dayData.notes,
        });
      } catch {
        throw new Error("Workout saved but failed to link to the plan day. Please try again.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan", plan.id] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.invalidateQueries({ queryKey: ["cardio-templates"] });
      setIsDirty(false);
      setIsEditing(false);
    },
    onError: () => {
      // Refresh to sync any partial state that was committed before the failure
      queryClient.invalidateQueries({ queryKey: ["plan", plan.id] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.invalidateQueries({ queryKey: ["cardio-templates"] });
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
              onClick={() => {
                setSelectedWeek(m.position);
                // Preserve the current day if it exists in the new week; else reset to 1
                if (selectedDay > plan.microcycleLength) setSelectedDay(1);
              }}
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

          {!isLocked && !isPast && (
            isEditing ? (
              <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saveMutation.isPending}>
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

        {/* Day type toggle — always visible while editing */}
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

        {/* Content */}
        {(isEditing ? dayType : dayData.type) === "rest" ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">Rest day — no workout</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Strength box */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Dumbbell className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wide">
                  Strength
                </span>
                {strengthTemplate?.name && (
                  <span className="text-xs text-muted-foreground">— {strengthTemplate.name}</span>
                )}
              </div>
              {!isEditing ? (
                <StrengthReadView rows={strengthRows} />
              ) : (
                <StrengthEditor
                  rows={strengthRows}
                  isEditing={isEditing}
                  disabled={saveMutation.isPending}
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
                {cardioTemplate?.name && (
                  <span className="text-xs text-muted-foreground">— {cardioTemplate.name}</span>
                )}
              </div>
              {!isEditing ? (
                <CardioReadView rows={cardioRows} />
              ) : (
                <CardioEditor
                  rows={cardioRows}
                  isEditing={isEditing}
                  disabled={saveMutation.isPending}
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
              <p className="text-xs text-destructive">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : "Save failed — try again."}
              </p>
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

interface AdherenceComponent {
  totalPlanned: number;
  totalCompleted: number;
  totalSkipped: number;
  totalMissed: number;
  weeks: AdherenceWeek[];
}

interface Adherence {
  completionRate: number;
  totalPlanned: number;
  totalCompleted: number;
  totalSkipped: number;
  totalMissed: number;
  currentStreak: number;
  longestStreak: number;
  totalVolume: { sets: number; reps: number; weightKg: number };
  weeks: AdherenceWeek[];
  strength: AdherenceComponent;
  cardio: AdherenceComponent;
}

function PlanAdherenceCard({ planId }: { planId: string }) {
  const [tab, setTab] = useState<"all" | "strength" | "cardio">("all");
  const { data: adherence, isLoading } = useQuery<Adherence | null>({
    queryKey: ["planAdherence", planId],
    queryFn: () => api.get(`/plans/${planId}/adherence`),
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

  // Determine which dataset to show in the per-week table
  const component = tab === "strength" ? adherence.strength : tab === "cardio" ? adherence.cardio : null;
  const weeksToShow = component ? component.weeks : adherence.weeks.filter((w) => w.planned > 0);
  const hasData = weeksToShow.some((w) => w.planned > 0);
  const totals = component
    ? { planned: component.totalPlanned, completed: component.totalCompleted, skipped: component.totalSkipped, missed: component.totalMissed }
    : { planned: adherence.totalPlanned, completed: adherence.totalCompleted, skipped: adherence.totalSkipped, missed: adherence.totalMissed };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Plan Adherence</h3>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 text-xs font-medium">
        {(["all", "strength", "cardio"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-md py-1 capitalize transition-colors",
              tab === t
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "all" ? "All" : t === "strength" ? "Strength" : "Cardio"}
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
            <span className="text-center text-destructive/70">Miss</span>
          </div>
          {weeksToShow.map((w) => (
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

          {/* Totals summary */}
          {totals.planned > 0 && (
            <p className="text-xs text-muted-foreground text-center pt-1">
              {totals.planned} planned ·{" "}
              <span className="text-emerald-600 dark:text-emerald-400">{totals.completed} done</span>
              {totals.skipped > 0 && (
                <> · <span className="text-amber-600 dark:text-amber-400">{totals.skipped} skipped</span></>
              )}
              {totals.missed > 0 && (
                <> · <span className="text-destructive/70">{totals.missed} missed</span></>
              )}
            </p>
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
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  if (plan.status === "active") {
    return null;
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>("mesocycle");
  const [dayViewWeek, setDayViewWeek] = useState<number | undefined>();
  const [dayViewDay, setDayViewDay] = useState<number | undefined>();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Fetch the user's single plan by list endpoint (no id in URL)
  const { data: planMeta, isLoading: isMetaLoading } = useQuery<{ id: string } | null>({
    queryKey: ["plans"],
    queryFn: () => api.get("/plans"),
  });
  const id = planMeta?.id;

  const { data: plan, isLoading: isPlanLoading, isError, refetch } = useQuery<TrainingPlan>({
    queryKey: ["plan", id],
    queryFn: () => api.get(`/plans/${id}`),
    enabled: !!id,
  });

  const isLoading = isMetaLoading || (!!id && isPlanLoading);

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

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <p className="text-sm text-destructive font-medium">Failed to load plan.</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // No plan yet — show creation form
  if (!planMeta || !plan) {
    return <PlannerPage />;
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
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold truncate">{plan.name}</h1>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border shrink-0",
                plan.status === "active"
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                  : plan.status === "completed"
                  ? "bg-muted text-muted-foreground border-border"
                  : "bg-muted/50 text-muted-foreground border-border"
              )}
            >
              {plan.status === "active" ? "Active" : plan.status === "completed" ? "Completed" : "Draft"}
            </span>
          </div>
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
      {plan.status === "active" && <PlanAdherenceCard planId={plan.id} />}

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
