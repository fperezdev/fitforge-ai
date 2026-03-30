import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ChevronDown,
  Dumbbell,
  Activity,
  Pencil,
  Check,
  X,
  SkipForward,
  Trash2,
} from "lucide-react";
import type { CardioSession } from "@fitforge/types";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDistance, formatDuration } from "@/lib/utils";
import { muscleLabel } from "@/lib/muscleLabels";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExerciseSet {
  id: string;
  setNumber: number;
  type: string;
  weightKg: string | null;
  reps: number | null;
  rir: number | null;
  completed: boolean;
}

interface ExerciseEntry {
  id: string;
  order: number;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetRir: number | null;
  exercise: { id: string; name: string; primaryMuscle: string };
  sets: ExerciseSet[];
}

interface SessionDetail {
  id: string;
  name: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  notes: string | null;
  exerciseEntries: ExerciseEntry[];
}

// ─── Cardio edit schema ───────────────────────────────────────────────────────

const nanToUndef = (v: unknown) => (typeof v === "number" && isNaN(v) ? undefined : v);

const cardioEditSchema = z.object({
  type: z.enum(["run", "walk", "bike", "swim", "other"]),
  distanceKm: z.preprocess(nanToUndef, z.number().positive().optional().nullable()) as z.ZodType<
    number | null | undefined
  >,
  durationMin: z.preprocess(nanToUndef, z.number().int().min(0).optional().nullable()) as z.ZodType<
    number | null | undefined
  >,
  durationSec: z.preprocess(
    nanToUndef,
    z.number().int().min(0).max(59).optional().nullable(),
  ) as z.ZodType<number | null | undefined>,
  avgHeartRate: z.preprocess(nanToUndef, z.number().int().optional().nullable()) as z.ZodType<
    number | null | undefined
  >,
  notes: z.string().optional().nullable(),
});
type CardioEditForm = z.infer<typeof cardioEditSchema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface DayReviewModalProps {
  open: boolean;
  onClose: () => void;
  planDayId: string;
  weekIndex: number;
  dayIndex: number;
  workoutStatus: string | undefined; // "workout_completed" | "workout_skipped" | undefined
  cardioStatus: string | undefined; // "cardio_completed" | "cardio_skipped" | undefined
  workoutTemplateName: string | null;
  cardioTemplateName: string | null;
}

// ─── Set edit row ─────────────────────────────────────────────────────────────

function SetEditRow({
  set,
  sessionId,
  entryId,
}: {
  set: ExerciseSet;
  sessionId: string;
  entryId: string;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [weight, setWeight] = useState(set.weightKg ?? "");
  const [reps, setReps] = useState(set.reps?.toString() ?? "");
  const [rir, setRir] = useState(set.rir?.toString() ?? "");

  const mutation = useMutation({
    mutationFn: (data: { weightKg?: number | null; reps?: number | null; rir?: number | null }) =>
      api.patch(`/sessions/${sessionId}/exercises/${entryId}/sets/${set.id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions", "byPlanDay"] });
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/sessions/${sessionId}/exercises/${entryId}/sets/${set.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions", "byPlanDay"] });
    },
  });

  function save() {
    mutation.mutate({
      weightKg: weight !== "" ? Number(weight) : null,
      reps: reps !== "" ? Number(reps) : null,
      rir: rir !== "" ? Number(rir) : null,
    });
  }

  if (editing) {
    return (
      <div
        className={cn(
          "grid grid-cols-[2rem_1fr_1fr_1fr_auto] gap-1.5 items-center py-1.5 rounded px-1",
          set.completed && "bg-emerald-500/5",
        )}
      >
        <span className="text-xs text-muted-foreground font-mono text-center">{set.setNumber}</span>
        <input
          type="number"
          step="0.5"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="kg"
          className="h-7 w-full rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <input
          type="number"
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          placeholder="reps"
          className="h-7 w-full rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <input
          type="number"
          value={rir}
          onChange={(e) => setRir(e.target.value)}
          placeholder="RIR"
          className="h-7 w-full rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Cancel"
            onClick={() => setEditing(false)}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Save"
            disabled={mutation.isPending}
            onClick={save}
            className="rounded p-0.5 text-muted-foreground hover:text-emerald-600 transition-colors disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (confirmingDelete) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-1 py-1.5 rounded",
          set.completed && "bg-emerald-500/5",
        )}
      >
        <span className="text-xs text-destructive">Delete set {set.setNumber}?</span>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Cancel delete"
            onClick={() => setConfirmingDelete(false)}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Confirm delete"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
            className="rounded p-0.5 text-destructive hover:text-destructive/80 transition-colors disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-[2rem_1fr_1fr_1fr_auto] gap-1.5 items-center py-1.5 rounded px-1 group",
        set.completed && "bg-emerald-500/5",
      )}
    >
      <span className="text-xs text-muted-foreground font-mono text-center">{set.setNumber}</span>
      <span className="text-sm">{set.weightKg != null ? `${set.weightKg} kg` : "—"}</span>
      <span className="text-sm">{set.reps != null ? set.reps : "—"}</span>
      <span className="text-sm text-muted-foreground">
        {set.rir != null ? `RIR ${set.rir}` : "—"}
      </span>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-all">
        <button
          type="button"
          aria-label="Edit set"
          onClick={() => {
            setWeight(set.weightKg ?? "");
            setReps(set.reps?.toString() ?? "");
            setRir(set.rir?.toString() ?? "");
            setEditing(true);
          }}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          aria-label="Delete set"
          onClick={() => setConfirmingDelete(true)}
          className="rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Workout section ──────────────────────────────────────────────────────────

function WorkoutReview({ session }: { session: SessionDetail }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const duration = session.completedAt
    ? Math.floor(
        (new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 1000,
      )
    : null;

  const completedSets = session.exerciseEntries
    .flatMap((e) => e.sets)
    .filter((s) => s.completed).length;
  const totalSets = session.exerciseEntries.flatMap((e) => e.sets).length;

  return (
    <div className="space-y-3">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Duration", value: duration ? formatDuration(duration) : "—" },
          { label: "Exercises", value: String(session.exerciseEntries.length) },
          { label: "Sets", value: `${completedSets}/${totalSets}` },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg bg-muted/40 px-3 py-2 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
              {label}
            </p>
            <p className="text-sm font-bold">{value}</p>
          </div>
        ))}
      </div>

      {/* Exercise list */}
      {session.exerciseEntries.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">No exercises recorded.</p>
      ) : (
        <div className="space-y-2">
          {session.exerciseEntries
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((entry) => {
              const isOpen = expanded === entry.id;
              const done = entry.sets.filter((s) => s.completed).length;
              const targetSets = entry.sets.length;
              const targetRepsLabel =
                entry.targetRepMin != null && entry.targetRepMax != null
                  ? entry.targetRepMin === entry.targetRepMax
                    ? `${entry.targetRepMin} reps`
                    : `${entry.targetRepMin}–${entry.targetRepMax} reps`
                  : null;
              const targetRirLabel = entry.targetRir != null ? `RIR ${entry.targetRir}` : null;

              return (
                <div key={entry.id} className="rounded-lg border border-border overflow-hidden">
                  <button
                    className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-3"
                    onClick={() => setExpanded(isOpen ? null : entry.id)}
                    aria-expanded={isOpen}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{entry.exercise.name}</span>
                        <Badge
                          variant={done > 0 ? "success" : "secondary"}
                          className="shrink-0 text-[10px]"
                        >
                          {done}/{targetSets} sets
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground">
                          {muscleLabel(entry.exercise.primaryMuscle)}
                        </p>
                        {(targetRepsLabel || targetRirLabel) && (
                          <p className="text-xs text-muted-foreground/60">
                            · Plan: {[targetRepsLabel, targetRirLabel].filter(Boolean).join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground shrink-0 transition-transform",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-3 border-t border-border/50">
                      <div className="grid grid-cols-[2rem_1fr_1fr_1fr_auto] gap-1.5 mb-1.5 pt-2">
                        <span className="text-[10px] text-muted-foreground text-center">Set</span>
                        <span className="text-[10px] text-muted-foreground">Weight</span>
                        <span className="text-[10px] text-muted-foreground">Reps</span>
                        <span className="text-[10px] text-muted-foreground">RIR</span>
                        <span />
                      </div>
                      <div className="space-y-0.5">
                        {entry.sets.map((set) => (
                          <SetEditRow
                            key={set.id}
                            set={set}
                            sessionId={session.id}
                            entryId={entry.id}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ─── Cardio section ───────────────────────────────────────────────────────────

function CardioReview({ session }: { session: CardioSession }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const durationMin =
    session.durationSeconds != null ? Math.floor(session.durationSeconds / 60) : undefined;
  const durationSec = session.durationSeconds != null ? session.durationSeconds % 60 : undefined;

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<CardioEditForm>({
    resolver: zodResolver(cardioEditSchema),
    defaultValues: {
      type: (session.type as CardioEditForm["type"]) ?? "run",
      distanceKm:
        session.distanceMeters != null
          ? Math.round((session.distanceMeters / 1000) * 100) / 100
          : undefined,
      durationMin,
      durationSec,
      avgHeartRate: session.avgHeartRate ?? undefined,
      notes: session.notes ?? undefined,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: CardioEditForm) => {
      const distanceMeters = data.distanceKm != null ? Math.round(data.distanceKm * 1000) : null;
      const durationSeconds =
        data.durationMin != null || data.durationSec != null
          ? (data.durationMin ?? 0) * 60 + (data.durationSec ?? 0)
          : null;
      const avgPaceSecondsPerKm =
        distanceMeters && durationSeconds && distanceMeters > 0
          ? Math.round(durationSeconds / (distanceMeters / 1000))
          : null;
      return api.patch(`/cardio/${session.id}`, {
        type: data.type,
        distanceMeters: distanceMeters || null,
        durationSeconds: durationSeconds || null,
        avgPaceSecondsPerKm,
        avgHeartRate: data.avgHeartRate ?? null,
        notes: data.notes ?? null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cardio", "byPlanDay"] });
      setEditing(false);
    },
  });

  const statItems = [
    session.distanceMeters != null && {
      label: "Distance",
      value: formatDistance(session.distanceMeters),
    },
    session.durationSeconds != null && {
      label: "Duration",
      value: formatDuration(session.durationSeconds),
    },
    session.avgHeartRate != null && {
      label: "Avg HR",
      value: `${session.avgHeartRate} bpm`,
    },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  if (editing) {
    return (
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-3" noValidate>
        <div>
          <label className="text-xs font-medium mb-1 block text-muted-foreground">
            Activity type
          </label>
          <select
            className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            {...register("type")}
          >
            <option value="run">Run</option>
            <option value="walk">Walk</option>
            <option value="bike">Bike</option>
            <option value="swim">Swim</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium mb-1 block text-muted-foreground">
              Distance (km)
            </label>
            <input
              type="number"
              step="0.01"
              placeholder="e.g. 5.00"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              {...register("distanceKm", { valueAsNumber: true })}
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block text-muted-foreground">Avg HR</label>
            <input
              type="number"
              placeholder="bpm"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              {...register("avgHeartRate", { valueAsNumber: true })}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block text-muted-foreground">Duration</label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min="0"
              placeholder="min"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              {...register("durationMin", { valueAsNumber: true })}
            />
            <input
              type="number"
              min="0"
              max="59"
              placeholder="sec"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              {...register("durationSec", { valueAsNumber: true })}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium mb-1 block text-muted-foreground">Notes</label>
          <input
            type="text"
            placeholder="How did it feel?"
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            {...register("notes")}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              reset();
              setEditing(false);
            }}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={isSubmitting || mutation.isPending}>
            Save
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium capitalize">{session.type}</span>
        <button
          type="button"
          aria-label="Edit cardio session"
          onClick={() => setEditing(true)}
          className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
      {statItems.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {statItems.map(({ label, value }) => (
            <div key={label} className="rounded-lg bg-muted/40 px-3 py-2 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                {label}
              </p>
              <p className="text-sm font-bold">{value}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No stats recorded.</p>
      )}
      {session.notes && <p className="text-xs text-muted-foreground italic">"{session.notes}"</p>}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function DayReviewModal({
  open,
  onClose,
  planDayId,
  weekIndex,
  dayIndex,
  workoutStatus,
  cardioStatus,
  workoutTemplateName,
  cardioTemplateName,
}: DayReviewModalProps) {
  const { data: sessions, isLoading: sessionsLoading } = useQuery<SessionDetail[]>({
    queryKey: ["sessions", "byPlanDay", planDayId],
    queryFn: () => api.get(`/sessions?planDayId=${planDayId}&limit=5`),
    enabled: open && workoutStatus === "workout_completed",
  });

  const { data: cardioSessions, isLoading: cardioLoading } = useQuery<CardioSession[]>({
    queryKey: ["cardio", "byPlanDay", planDayId],
    queryFn: () => api.get(`/cardio?planDayId=${planDayId}&limit=5`),
    enabled: open && cardioStatus === "cardio_completed",
  });

  const title = `Week ${weekIndex + 1} · Day ${dayIndex + 1}`;

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-5">
        {/* Strength section */}
        {workoutTemplateName && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-semibold">{workoutTemplateName}</span>
              {workoutStatus === "workout_completed" && (
                <Badge variant="success" className="text-[10px]">
                  Done
                </Badge>
              )}
              {workoutStatus === "workout_skipped" && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <SkipForward className="h-2.5 w-2.5" />
                  Skipped
                </Badge>
              )}
            </div>

            {workoutStatus === "workout_completed" && (
              <>
                {sessionsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                  </div>
                ) : sessions && sessions.length > 0 ? (
                  <WorkoutReview session={sessions[0]} />
                ) : (
                  <p className="text-xs text-muted-foreground">Session data not found.</p>
                )}
              </>
            )}

            {workoutStatus === "workout_skipped" && (
              <p className="text-xs text-muted-foreground">This strength session was skipped.</p>
            )}
          </div>
        )}

        {/* Divider when both sections exist */}
        {workoutTemplateName && cardioTemplateName && <div className="border-t border-border/60" />}

        {/* Cardio section */}
        {cardioTemplateName && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-sm font-semibold">{cardioTemplateName}</span>
              {cardioStatus === "cardio_completed" && (
                <Badge variant="success" className="text-[10px]">
                  Done
                </Badge>
              )}
              {cardioStatus === "cardio_skipped" && (
                <Badge variant="secondary" className="text-[10px] gap-1">
                  <SkipForward className="h-2.5 w-2.5" />
                  Skipped
                </Badge>
              )}
            </div>

            {cardioStatus === "cardio_completed" && (
              <>
                {cardioLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10" />
                  </div>
                ) : cardioSessions && cardioSessions.length > 0 ? (
                  <CardioReview session={cardioSessions[0]} />
                ) : (
                  <p className="text-xs text-muted-foreground">Session data not found.</p>
                )}
              </>
            )}

            {cardioStatus === "cardio_skipped" && (
              <p className="text-xs text-muted-foreground">This cardio session was skipped.</p>
            )}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
