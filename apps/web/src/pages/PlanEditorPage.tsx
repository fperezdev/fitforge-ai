import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DaySessionModal } from "@/components/plan/DaySessionModal";
import { DayReviewModal } from "@/components/plan/DayReviewModal";
import { PlannerPage } from "./PlannerPage";
import {
  DndContext,
  closestCenter,
  pointerWithin,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  Plus,
  Trash2,
  Save,
  X,
  Pencil,
  BarChart2,
  MoreHorizontal,
  Copy,
  ListChecks,
  BedDouble,
  Dumbbell,
  Activity,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { muscleLabel } from "@/lib/muscleLabels";

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
    secondaryMuscles: string[];
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

type DayType = "training" | "rest";

// ─── Today's plan types ───────────────────────────────────────────────────────

interface SuggestedDay {
  planDayId: string;
  weekIndex: number;
  dayIndex: number;
  scheduledDate: string;
  type: string;
  workoutTemplate: { id: string; name: string } | null;
  cardioTemplate: { id: string; name: string } | null;
}

interface ActivePlanSummary {
  id: string;
  name: string;
  suggestedDay: SuggestedDay | null;
}

// ─── Today's plan card ────────────────────────────────────────────────────────

function TodaysPlanCard({ plan }: { plan: ActivePlanSummary }) {
  const day = plan.suggestedDay;
  const isRest = !day || day.type === "rest";
  const isTraining = !isRest;
  const weekLabel = day ? `Week ${day.weekIndex + 1} · Day ${day.dayIndex + 1}` : null;

  const [sessionModalOpen, setSessionModalOpen] = useState(false);

  const todayStr = new Date().toLocaleDateString("en-CA");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString("en-CA");

  const scheduledDateLabel = day?.scheduledDate
    ? new Date(day.scheduledDate + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : null;

  const dayLabel = !day?.scheduledDate
    ? "Active plan"
    : day.scheduledDate === todayStr
      ? "Today's plan"
      : day.scheduledDate === tomorrowStr
        ? "Tomorrow's plan"
        : "Upcoming plan";

  const hasWorkout = isTraining && !!day?.workoutTemplate;
  const hasCardio = isTraining && !!day?.cardioTemplate;
  const hasAny = hasWorkout || hasCardio;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-start gap-3 min-w-0">
        <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary shrink-0">
          {isRest ? <BedDouble className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide leading-none mb-0.5">
            {dayLabel}
          </p>
          {weekLabel && (
            <p className="text-sm text-muted-foreground">
              {weekLabel}
              {scheduledDateLabel && (
                <span className="ml-2 text-xs opacity-70">· {scheduledDateLabel}</span>
              )}
            </p>
          )}
          {isRest && (
            <p className="text-sm text-muted-foreground mt-0.5">Rest day — recover well</p>
          )}
        </div>
        {hasAny && day && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => setSessionModalOpen(true)}
          >
            Start
          </Button>
        )}
      </div>

      {/* Activity labels */}
      {hasWorkout && day && (
        <div className="flex items-center gap-2 min-w-0 pt-1 border-t border-border/40">
          <Dumbbell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{day.workoutTemplate!.name}</span>
        </div>
      )}
      {hasCardio && day && (
        <div className="flex items-center gap-2 min-w-0 pt-1 border-t border-border/40">
          <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{day.cardioTemplate!.name}</span>
        </div>
      )}

      {day && sessionModalOpen && (
        <DaySessionModal
          open={sessionModalOpen}
          onClose={() => setSessionModalOpen(false)}
          planDayId={day.planDayId}
          weekIndex={day.weekIndex}
          dayIndex={day.dayIndex}
          workoutTemplate={day.workoutTemplate}
          cardioTemplate={day.cardioTemplate}
        />
      )}
    </div>
  );
}

// ─── Day type config ──────────────────────────────────────────────────────────

const DAY_TYPE_LABELS: Record<DayType, string> = {
  training: "Training",
  rest: "Rest",
};

// ─── Schedule date helper ─────────────────────────────────────────────────────

/**
 * Returns the YYYY-MM-DD date for a given plan slot (0-based weekIndex, dayIndex)
 * anchored to plan.startDate (or plan.activatedAt for legacy rows).
 * Returns null if the plan has no anchor yet (draft).
 */
function getPlanSlotDate(
  plan: Pick<TrainingPlan, "startDate" | "activatedAt" | "microcycleLength">,
  weekIndex0: number,
  dayIndex0: number,
): string | null {
  const anchorStr = plan.startDate ?? plan.activatedAt;
  if (!anchorStr) return null;
  const anchor = plan.startDate ? new Date(plan.startDate + "T00:00:00") : new Date(anchorStr);
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

// ─── Week Volume ──────────────────────────────────────────────────────────────

function computeWeekVolume(mc: PlanMicrocycle): Map<string, number> {
  const volume = new Map<string, number>();
  for (const day of mc.days) {
    if (day.type !== "training" || !day.workoutTemplate) continue;
    for (const te of day.workoutTemplate.templateExercises) {
      const { primaryMuscle, secondaryMuscles } = te.exercise;
      const sets = te.targetSets;
      volume.set(primaryMuscle, (volume.get(primaryMuscle) ?? 0) + sets);
      for (const m of secondaryMuscles) {
        volume.set(m, (volume.get(m) ?? 0) + sets * 0.5);
      }
    }
  }
  return volume;
}

function computeWeekCardioKm(mc: PlanMicrocycle): number {
  let total = 0;
  for (const day of mc.days) {
    if (day.type !== "training" || !day.cardioTemplate) continue;
    for (const ex of day.cardioTemplate.cardioTemplateExercises) {
      total += ex.kilometers ? parseFloat(ex.kilometers) : 0;
    }
  }
  return total;
}

function WeekVolumeModal({
  mc,
  open,
  onClose,
}: {
  mc: PlanMicrocycle;
  open: boolean;
  onClose: () => void;
}) {
  const volume = computeWeekVolume(mc);
  const rows = Array.from(volume.entries())
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);
  const max = rows[0]?.[1] ?? 1;
  const totalKm = computeWeekCardioKm(mc);

  return (
    <Modal open={open} onClose={onClose} title={`${mc.name ?? `Week ${mc.position}`} — Volume`}>
      {rows.length === 0 && totalKm === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No training days assigned for this week.
        </p>
      ) : (
        <div className="space-y-4 py-1">
          {rows.length > 0 && (
            <div className="space-y-2.5">
              {rows.map(([muscle, sets]) => (
                <div key={muscle} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-sm text-foreground truncate">
                    {muscleLabel(muscle)}
                  </span>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${(sets / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                      {Number.isInteger(sets) ? sets : sets.toFixed(1)} sets
                    </span>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                Secondary muscles counted at 0.5× sets.
              </p>
            </div>
          )}
          {totalKm > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-sm text-foreground">Cardio distance</span>
              <span className="text-sm tabular-nums font-medium">
                {totalKm % 1 === 0 ? totalKm : totalKm.toFixed(1)} km
              </span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ─── Week Context Menu ────────────────────────────────────────────────────────

function WeekMenu({
  onClone,
  onDelete,
  isPending,
}: {
  onClone: () => void;
  onDelete?: () => void;
  isPending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        aria-label="Week options"
        className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute z-50 right-0 top-full mt-1 rounded-xl border border-border bg-card shadow-xl p-1 min-w-[150px]">
            <button
              onClick={() => {
                onClone();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-muted transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />
              Clone week
            </button>
            {onDelete && (
              <button
                onClick={() => {
                  onDelete();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete week
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Day Context Menu ─────────────────────────────────────────────────────────

function DayMenu({
  canEdit,
  onEdit,
  onClone,
  onDelete,
  canDelete,
  isPending,
}: {
  canEdit: boolean;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
  canDelete: boolean;
  isPending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        disabled={isPending}
        aria-label="Day options"
        className="rounded p-0.5 text-muted-foreground/50 hover:text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
      >
        <MoreHorizontal className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="fixed z-50 rounded-xl border border-border bg-card shadow-xl p-1 min-w-[140px]"
            style={{ top: pos.top, right: pos.right }}
          >
            {canEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-muted transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClone();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-muted transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />
              Clone
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
                setOpen(false);
              }}
              disabled={!canDelete}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete day
            </button>
          </div>
        </>
      )}
    </>
  );
}

// ─── Day Cell ─────────────────────────────────────────────────────────────────

function DayCell({
  day,
  templates,
  cardioTemplates,
  isLocked,
  isDraggable = false,
  isReordering = false,
  scheduledDate,
  status,
  weekIndex,
  dayIndex,
  planDayId,
  planId,
  isOverlay = false,
  onClone,
  onDelete,
  canDelete,
  menuPending,
}: {
  day: PlanDay;
  templates: Template[];
  cardioTemplates: CardioTemplate[];
  isLocked: boolean;
  isDraggable?: boolean;
  isReordering?: boolean;
  scheduledDate?: string | null;
  status?: { workout?: string; cardio?: string } | null;
  weekIndex?: number;
  dayIndex?: number;
  planDayId?: string;
  planId?: string;
  isOverlay?: boolean;
  onClone?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
  menuPending?: boolean;
}) {
  const navigate = useNavigate();
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  // A past day is any scheduled slot strictly before today (only relevant for active plans)
  const isPast = (() => {
    if (!scheduledDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(scheduledDate + "T00:00:00") < today;
  })();

  const workoutDone = status?.workout === "workout_completed";
  const cardioDone = status?.cardio === "cardio_completed";
  const workoutSkipped = status?.workout === "workout_skipped";
  const cardioSkipped = status?.cardio === "cardio_skipped";
  // A day is reviewable if at least one component has been acted on (done or skipped)
  const isReviewable = isPast && (workoutDone || cardioDone || workoutSkipped || cardioSkipped);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: day.dayNumber,
    disabled: !isDraggable || isOverlay || isPast,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const hasStrength = day.type === "training" && !!day.workoutTemplateId;
  const hasCardio = day.type === "training" && !!day.cardioTemplateId;
  const hasAny = hasStrength || hasCardio;

  const strengthName = hasStrength
    ? (day.workoutTemplate?.name ??
      templates.find((t) => t.id === day.workoutTemplateId)?.name ??
      "Strength")
    : null;
  const cardioName = hasCardio
    ? (day.cardioTemplate?.name ??
      cardioTemplates.find((t) => t.id === day.cardioTemplateId)?.name ??
      "Cardio")
    : null;

  // Clicking a training day opens the review modal if done, or the session modal if pending.
  const handleClick = () => {
    if (isDragging || isReordering || day.type !== "training") return;
    if (isReviewable) {
      setReviewModalOpen(true);
    } else if (hasAny && !isPast) {
      setSessionModalOpen(true);
    }
  };

  const isClickable =
    day.type === "training" && !isReordering && (isReviewable || (!isPast && hasAny));

  const showMenu = !isLocked && !isReordering && !isOverlay && (onClone || onDelete);

  return (
    <div ref={setNodeRef} style={style} className={cn("relative", isDragging && "opacity-30")}>
      <button
        {...(isDraggable ? { ...attributes, ...listeners } : {})}
        onClick={handleClick}
        className={cn(
          "w-full rounded-lg border text-left transition-colors flex flex-col p-1.5 h-[60px] overflow-hidden",
          isDraggable &&
            !isPast &&
            !isReviewable &&
            "cursor-grab active:cursor-grabbing touch-none",
          isPast && !isReviewable && "cursor-default opacity-60",
          isReviewable && "cursor-pointer",
          hasAny
            ? cn("border-primary/30 bg-primary/5", isClickable && "hover:bg-primary/10")
            : day.type === "rest"
              ? cn("border-dashed border-border bg-muted/30", !isPast && "hover:bg-muted/50")
              : cn("border-dashed border-border", !isPast && "hover:bg-muted/40"),
          isLocked && day.type !== "training" && "cursor-default opacity-70",
          !isClickable && day.type === "training" && "cursor-default",
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
        </span>

        {day.type !== "training" ? (
          <span className="block text-[10px] text-muted-foreground leading-tight">
            {DAY_TYPE_LABELS[day.type]}
          </span>
        ) : (
          <div className="space-y-0.5">
            {(() => {
              const ws = status?.workout;
              const label =
                ws === "workout_skipped"
                  ? "Strength skipped"
                  : ws === "workout_completed"
                    ? "Strength done"
                    : (strengthName ?? "No Strength");
              const color =
                ws === "workout_skipped"
                  ? "text-slate-400"
                  : ws === "workout_completed"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : hasStrength
                      ? "text-primary"
                      : "text-muted-foreground/30";
              return (
                <span className={cn("block text-[10px] font-medium leading-tight truncate", color)}>
                  {label}
                </span>
              );
            })()}
            {(() => {
              const cs = status?.cardio;
              const label =
                cs === "cardio_skipped"
                  ? "Cardio skipped"
                  : cs === "cardio_completed"
                    ? "Cardio done"
                    : (cardioName ?? "No Cardio");
              const color =
                cs === "cardio_skipped"
                  ? "text-slate-400"
                  : cs === "cardio_completed"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : hasCardio
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground/30";
              return (
                <span className={cn("block text-[10px] font-medium leading-tight truncate", color)}>
                  {label}
                </span>
              );
            })()}
          </div>
        )}

        {isLocked && <Check className="h-3 w-3 text-emerald-500 absolute top-1.5 right-1.5" />}
      </button>
      {showMenu && (
        <div className="absolute top-0.5 right-0.5 z-10">
          <DayMenu
            canEdit={!isLocked && !isReviewable}
            onEdit={() =>
              navigate("/plan/day", {
                state: {
                  planId,
                  microcycleId: day.planMicrocycleId,
                  dayNumber: day.dayNumber,
                  weekIndex: weekIndex ?? 0,
                  dayIndex: dayIndex ?? 0,
                },
              })
            }
            onClone={onClone!}
            onDelete={onDelete!}
            canDelete={canDelete ?? false}
            isPending={menuPending}
          />
        </div>
      )}
      {sessionModalOpen && planDayId != null && weekIndex != null && dayIndex != null && (
        <DaySessionModal
          open={sessionModalOpen}
          onClose={() => setSessionModalOpen(false)}
          planDayId={planDayId}
          weekIndex={weekIndex}
          dayIndex={dayIndex}
          workoutTemplate={hasStrength ? { id: day.workoutTemplateId!, name: strengthName! } : null}
          cardioTemplate={hasCardio ? { id: day.cardioTemplateId!, name: cardioName! } : null}
          workoutDone={workoutDone || workoutSkipped}
          cardioDone={cardioDone || cardioSkipped}
        />
      )}
      {reviewModalOpen && planDayId != null && weekIndex != null && dayIndex != null && (
        <DayReviewModal
          open={reviewModalOpen}
          onClose={() => setReviewModalOpen(false)}
          planDayId={planDayId}
          weekIndex={weekIndex}
          dayIndex={dayIndex}
          workoutStatus={status?.workout}
          cardioStatus={status?.cardio}
          workoutTemplateName={strengthName}
          cardioTemplateName={cardioName}
        />
      )}
    </div>
  );
}

// ─── Plan View (mesocycle grid) ───────────────────────────────────────────────

function PlanView({
  plan,
  templates,
  cardioTemplates,
}: {
  plan: TrainingPlan;
  templates: Template[];
  cardioTemplates: CardioTemplate[];
}) {
  const queryClient = useQueryClient();
  const [editingMcId, setEditingMcId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [volumeModalMcId, setVolumeModalMcId] = useState<string | null>(null);

  // Local day order — only committed to the server on Save
  const canonicalOrder = Array.from({ length: plan.microcycleLength }, (_, i) => i + 1);
  const [isReordering, setIsReordering] = useState(false);
  const [localDayOrder, setLocalDayOrder] = useState<number[]>(() =>
    Array.from({ length: plan.microcycleLength }, (_, i) => i + 1),
  );

  const isLocked = plan.status === "completed";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const renameMutation = useMutation({
    mutationFn: ({ mcId, name }: { mcId: string; name: string }) =>
      api.patch(`/plans/${plan.id}/microcycles/${mcId}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan", plan.id] });
      queryClient.invalidateQueries({ queryKey: ["activePlan"] });
      setEditingMcId(null);
    },
  });

  const addWeekMutation = useMutation({
    mutationFn: () => api.post(`/plans/${plan.id}/microcycles`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan", plan.id] });
      queryClient.invalidateQueries({ queryKey: ["activePlan"] });
    },
  });

  const addDayMutation = useMutation({
    mutationFn: () => api.post(`/plans/${plan.id}/days/extend`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan", plan.id] });
      queryClient.invalidateQueries({ queryKey: ["activePlan"] });
    },
  });

  const deleteWeekMutation = useMutation({
    mutationFn: (mcId: string) => api.delete(`/plans/${plan.id}/microcycles/${mcId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan", plan.id] });
      queryClient.invalidateQueries({ queryKey: ["activePlan"] });
    },
  });

  const reorderDaysMutation = useMutation({
    mutationFn: (order: number[]) => api.patch(`/plans/${plan.id}/days/reorder`, { order }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["plan", plan.id] });
      queryClient.invalidateQueries({ queryKey: ["activePlan"] });
      setIsReordering(false);
    },
    onError: () => {
      // Stay in reorder mode so the user can retry or cancel.
    },
  });

  const cloneWeekMutation = useMutation({
    mutationFn: (mcId: string) => api.post(`/plans/${plan.id}/microcycles/${mcId}/clone`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan", plan.id] });
      queryClient.invalidateQueries({ queryKey: ["activePlan"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.invalidateQueries({ queryKey: ["cardio-templates"] });
    },
  });

  const cloneDayMutation = useMutation({
    mutationFn: ({ mcId, dayNum }: { mcId: string; dayNum: number }) =>
      api.post(`/plans/${plan.id}/microcycles/${mcId}/days/${dayNum}/clone`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan", plan.id] });
      queryClient.invalidateQueries({ queryKey: ["activePlan"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.invalidateQueries({ queryKey: ["cardio-templates"] });
    },
  });

  const deleteDayMutation = useMutation({
    mutationFn: (dayNumber: number) => api.delete(`/plans/${plan.id}/days/${dayNumber}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan", plan.id] });
      queryClient.invalidateQueries({ queryKey: ["activePlan"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.invalidateQueries({ queryKey: ["cardio-templates"] });
    },
  });

  const canDeleteWeek = plan.microcycles.length > 1;
  const dayOrder = isReordering ? localDayOrder : canonicalOrder;

  const handleCancelReorder = () => {
    setIsReordering(false);
    setLocalDayOrder(canonicalOrder);
  };

  const handleSaveReorder = () => {
    reorderDaysMutation.mutate(localDayOrder);
  };

  // Pick the day data for the drag overlay from the first microcycle that has it configured,
  // so the ghost reflects real content rather than always defaulting to week 1.
  const activeDayStub =
    activeId != null
      ? (() => {
          const mcWithDay = plan.microcycles.find((mc) =>
            mc.days.some((d) => d.dayNumber === activeId),
          );
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
      collisionDetection={(args) => {
        // Use pointer-within first for precise hit detection, then fall back to closestCenter.
        const pointerCollisions = pointerWithin(args);
        if (pointerCollisions.length > 0) return pointerCollisions;
        return closestCenter(args);
      }}
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
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setLocalDayOrder(canonicalOrder);
                  setIsReordering(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit order
              </Button>
            )}
          </div>
        )}

        <SortableContext items={dayOrder} strategy={horizontalListSortingStrategy}>
          {plan.microcycles.map((mc) => {
            const assignedCount = mc.days.filter(
              (d) => d.type !== "training" || d.workoutTemplateId || d.cardioTemplateId,
            ).length;
            const totalDays = plan.microcycleLength;

            // Week is fully done when every configured training day has a "done" log
            const weekComplete =
              plan.status === "active" &&
              (() => {
                const trainingDays = mc.days.filter(
                  (d) => d.type === "training" && (d.workoutTemplateId || d.cardioTemplateId),
                );
                if (trainingDays.length === 0) return false;
                return trainingDays.every((d) => {
                  const s = plan.dayLogs?.[`${mc.position - 1}:${d.dayNumber - 1}`];
                  return (
                    s && (s.workout === "workout_completed" || s.cardio === "cardio_completed")
                  );
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
                    <button
                      onClick={() => setVolumeModalMcId(mc.id)}
                      aria-label="View week volume"
                      className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <BarChart2 className="h-3.5 w-3.5" />
                    </button>
                    {!isLocked && (
                      <WeekMenu
                        onClone={() => cloneWeekMutation.mutate(mc.id)}
                        onDelete={
                          canDeleteWeek ? () => deleteWeekMutation.mutate(mc.id) : undefined
                        }
                        isPending={cloneWeekMutation.isPending || deleteWeekMutation.isPending}
                      />
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
                            isLocked={isLocked}
                            isDraggable={
                              isReordering && !isLocked && !reorderDaysMutation.isPending
                            }
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
                            weekIndex={mc.position - 1}
                            dayIndex={d - 1}
                            planDayId={day.id}
                            planId={plan.id}
                            onClone={() =>
                              cloneDayMutation.mutate({ mcId: mc.id, dayNum: day.dayNumber })
                            }
                            onDelete={() => deleteDayMutation.mutate(day.dayNumber)}
                            canDelete={plan.microcycleLength > 1}
                            menuPending={cloneDayMutation.isPending || deleteDayMutation.isPending}
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

        {volumeModalMcId && (
          <WeekVolumeModal
            mc={plan.microcycles.find((m) => m.id === volumeModalMcId)!}
            open={true}
            onClose={() => setVolumeModalMcId(null)}
          />
        )}

        {/* (delete drop zone removed — deletion is now via the day options menu) */}

        {!isLocked && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              loading={addWeekMutation.isPending}
              onClick={() => addWeekMutation.mutate()}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add week
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={addDayMutation.isPending}
              onClick={() => addDayMutation.mutate()}
            >
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
            <span className="text-sm font-medium tabular-nums">
              {assignedDays}/{totalDays}
            </span>
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
              allAssigned ? "bg-emerald-500" : "bg-primary",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setStartDate(todayISO());
        }}
        title="Set plan start date"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Day 1 of your plan will be scheduled on this date. Each training day gets a fixed
            calendar slot — skipping a day doesn't shift the schedule.
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
              onClick={() => {
                setModalOpen(false);
                setStartDate(todayISO());
              }}
            >
              Cancel
            </Button>
            <Button loading={finalizeMutation.isPending} onClick={() => finalizeMutation.mutate()}>
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
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [completePlanModalOpen, setCompletePlanModalOpen] = useState(false);
  const [editingPlanName, setEditingPlanName] = useState(false);
  const [planNameDraft, setPlanNameDraft] = useState("");

  // Fetch the user's single plan by list endpoint (no id in URL)
  const { data: planMeta, isLoading: isMetaLoading } = useQuery<{ id: string } | null>({
    queryKey: ["plans"],
    queryFn: () => api.get("/plans"),
  });
  const id = planMeta?.id;

  const {
    data: plan,
    isLoading: isPlanLoading,
    isError,
    refetch,
  } = useQuery<TrainingPlan>({
    queryKey: ["plan", id],
    queryFn: () => api.get(`/plans/${id}`),
    enabled: !!id,
  });

  const isLoading = isMetaLoading || (!!id && isPlanLoading);

  const deletePlanMutation = useMutation({
    mutationFn: () => api.delete(`/plans/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      navigate("/plan", { replace: true });
    },
  });

  const renamePlanMutation = useMutation({
    mutationFn: (name: string) => api.put(`/plans/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plan", id] });
      setEditingPlanName(false);
    },
  });

  const completePlanMutation = useMutation({
    mutationFn: () => api.post("/plans/active/complete", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["plan", id] });
      queryClient.invalidateQueries({ queryKey: ["activePlan"] });
      setCompletePlanModalOpen(false);
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

  const { data: activePlanSummary } = useQuery<ActivePlanSummary | null>({
    queryKey: ["activePlan"],
    queryFn: () => api.get("/plans/active"),
    enabled: plan?.status === "active",
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
      <div className="space-y-5">
        {/* Header skeleton */}
        <div className="flex items-start gap-3">
          <div className="flex-1 space-y-1">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-8 w-20 rounded-md shrink-0" />
        </div>
        {/* Content skeleton */}
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    );
  }

  // No plan yet — show creation form
  if (!planMeta || !plan) {
    return <PlannerPage />;
  }

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {editingPlanName ? (
                <input
                  autoFocus
                  value={planNameDraft}
                  onChange={(e) => setPlanNameDraft(e.target.value)}
                  onBlur={() => {
                    if (planNameDraft.trim() && planNameDraft !== plan.name) {
                      renamePlanMutation.mutate(planNameDraft.trim());
                    } else {
                      setEditingPlanName(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (planNameDraft.trim() && planNameDraft !== plan.name) {
                        renamePlanMutation.mutate(planNameDraft.trim());
                      } else {
                        setEditingPlanName(false);
                      }
                    }
                    if (e.key === "Escape") setEditingPlanName(false);
                  }}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-ring min-w-0 flex-1"
                />
              ) : (
                <button
                  className="text-xl font-bold truncate hover:text-primary transition-colors text-left"
                  onClick={() => {
                    if (plan.status === "completed") return;
                    setPlanNameDraft(plan.name);
                    setEditingPlanName(true);
                  }}
                  title={plan.status !== "completed" ? "Click to rename" : undefined}
                >
                  {plan.name}
                </button>
              )}
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border shrink-0",
                  plan.status === "active"
                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                    : plan.status === "completed"
                      ? "bg-muted text-muted-foreground border-border"
                      : "bg-muted/50 text-muted-foreground border-border",
                )}
              >
                {plan.status === "active"
                  ? "Active"
                  : plan.status === "completed"
                    ? "Completed"
                    : "Draft"}
              </span>
            </div>
            {plan.description && (
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                {plan.description}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {plan.mesocycleLength} week{plan.mesocycleLength !== 1 ? "s" : ""} ·{" "}
              {plan.microcycleLength} days/week
            </p>
          </div>
          {plan.status === "active" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCompletePlanModalOpen(true)}
              className="shrink-0"
            >
              Complete Plan
            </Button>
          )}
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

        {/* Today's plan */}
        {plan.status === "active" && activePlanSummary && (
          <TodaysPlanCard plan={activePlanSummary} />
        )}

        {/* Status banner */}
        <PlanStatusBanner plan={plan} />

        {/* Plan grid */}
        <PlanView plan={plan} templates={templates} cardioTemplates={cardioTemplates} />
      </div>

      <Modal
        open={completePlanModalOpen}
        onClose={() => setCompletePlanModalOpen(false)}
        title="Complete training plan"
      >
        <p className="text-sm text-muted-foreground mb-2">
          This will skip all remaining unfinished sessions and mark this plan as completed.
          In-progress workouts will be cancelled.
        </p>
        <p className="text-sm text-muted-foreground mb-6">This action cannot be undone.</p>
        {completePlanMutation.isError && (
          <p className="text-xs text-destructive mb-4">
            {completePlanMutation.error instanceof Error
              ? completePlanMutation.error.message
              : "Failed to complete plan. Please try again."}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setCompletePlanModalOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => completePlanMutation.mutate()}
            loading={completePlanMutation.isPending}
          >
            Complete plan
          </Button>
        </div>
      </Modal>

      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete training plan"
      >
        <p className="text-sm text-muted-foreground mb-6">
          This will permanently delete your training plan and all its data. This action cannot be
          undone.
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
