import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Play, Activity, Dumbbell, SkipForward } from "lucide-react";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkipDayModal } from "@/components/ui/skip-day-modal";
import { useSkipDay } from "@/hooks/useSkipDay";
import { useState } from "react";

// ─── Cardio form schema (lifted from CardioPage) ──────────────────────────────

const nanToUndef = (v: unknown) => (typeof v === "number" && isNaN(v) ? undefined : v);

const cardioSchema = z.object({
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

type CardioForm = z.infer<typeof cardioSchema>;

function toApiPayload(data: CardioForm) {
  const distanceMeters = data.distanceKm != null ? Math.round(data.distanceKm * 1000) : null;
  const durationSeconds =
    data.durationMin != null || data.durationSec != null
      ? (data.durationMin ?? 0) * 60 + (data.durationSec ?? 0)
      : null;
  const avgPaceSecondsPerKm =
    distanceMeters && durationSeconds && distanceMeters > 0
      ? Math.round(durationSeconds / (distanceMeters / 1000))
      : null;
  return {
    type: data.type,
    distanceMeters: distanceMeters || null,
    durationSeconds: durationSeconds || null,
    avgPaceSecondsPerKm,
    avgHeartRate: data.avgHeartRate ?? null,
    notes: data.notes ?? null,
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DaySessionModalProps {
  open: boolean;
  onClose: () => void;
  planDayId: string;
  weekIndex: number;
  dayIndex: number;
  workoutTemplate: { id: string; name: string } | null;
  cardioTemplate: { id: string; name: string } | null;
  /** Hide the strength section if already done or skipped */
  workoutDone?: boolean;
  /** Hide the cardio section if already done or skipped */
  cardioDone?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DaySessionModal({
  open,
  onClose,
  planDayId,
  weekIndex,
  dayIndex,
  workoutTemplate,
  cardioTemplate,
  workoutDone = false,
  cardioDone = false,
}: DaySessionModalProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Which skip component is being targeted: "workout" or "cardio"
  const [skipComponent, setSkipComponent] = useState<"workout" | "cardio" | null>(null);
  const [cardioFormOpen, setCardioFormOpen] = useState(false);

  const skipDay = useSkipDay();

  // ── Strength: start session ──────────────────────────────────────────────
  const startMutation = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/sessions", {
        templateId: workoutTemplate?.id,
        planDayId,
        weekIndex,
        dayIndex,
      }),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["activePlan"] });
      onClose();
      navigate(`/workout/${session.id}`);
    },
  });

  // ── Cardio: log session ──────────────────────────────────────────────────
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<CardioForm>({
    resolver: zodResolver(cardioSchema),
    defaultValues: { type: "run" },
  });

  const logMutation = useMutation({
    mutationFn: (data: CardioForm) =>
      api.post("/cardio", {
        ...toApiPayload(data),
        planDayId,
        weekIndex,
        dayIndex,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cardio"] }),
        queryClient.invalidateQueries({ queryKey: ["activePlan"] }),
      ]);
      setCardioFormOpen(false);
      reset({ type: "run" });
      onClose();
    },
  });

  function handleClose() {
    setCardioFormOpen(false);
    reset({ type: "run" });
    onClose();
  }

  function openSkip(component: "workout" | "cardio") {
    setSkipComponent(component);
    skipDay.openConfirm();
  }

  function closeSkip() {
    skipDay.closeConfirm();
    setSkipComponent(null);
  }

  const skipName =
    skipComponent === "workout" ? (workoutTemplate?.name ?? null) : (cardioTemplate?.name ?? null);

  // ── Render: cardio inline form ───────────────────────────────────────────
  if (cardioFormOpen) {
    return (
      <Modal open={open} onClose={handleClose} title="Log cardio">
        <form
          onSubmit={handleSubmit((d) => logMutation.mutate(d))}
          className="space-y-4"
          noValidate
        >
          <div>
            <label className="text-sm font-medium mb-1.5 block">Activity type</label>
            <select
              className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              {...register("type")}
            >
              <option value="run">Run</option>
              <option value="walk">Walk</option>
              <option value="bike">Bike</option>
              <option value="swim">Swim</option>
              <option value="other">Other</option>
            </select>
          </div>
          <Input
            label="Distance (km)"
            type="number"
            step="0.01"
            placeholder="e.g. 5.00"
            {...register("distanceKm", { valueAsNumber: true })}
          />
          <div>
            <label className="text-sm font-medium mb-1.5 block">Duration</label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label=""
                type="number"
                min="0"
                placeholder="min"
                {...register("durationMin", { valueAsNumber: true })}
              />
              <Input
                label=""
                type="number"
                min="0"
                max="59"
                placeholder="sec"
                {...register("durationSec", { valueAsNumber: true })}
              />
            </div>
          </div>
          <Input
            label="Avg HR (bpm)"
            type="number"
            {...register("avgHeartRate", { valueAsNumber: true })}
          />
          <Input label="Notes (optional)" placeholder="How did it feel?" {...register("notes")} />
          <p className="text-xs text-muted-foreground">
            This session will be linked to your active plan.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => setCardioFormOpen(false)}>
              Back
            </Button>
            <Button type="submit" loading={isSubmitting || logMutation.isPending}>
              Log session
            </Button>
          </div>
        </form>
      </Modal>
    );
  }

  // ── Render: skip modal ───────────────────────────────────────────────────
  if (skipDay.confirmOpen && skipComponent) {
    return (
      <SkipDayModal
        open={true}
        workoutName={skipName}
        weekIndex={weekIndex}
        dayIndex={dayIndex}
        isPending={skipDay.isPending}
        isSkipError={skipDay.isSkipError}
        isMoveError={skipDay.isMoveError}
        onSkip={(notes) =>
          skipDay.skip({
            weekIndex,
            dayIndex,
            component: skipComponent,
            notes,
          })
        }
        onMove={() => skipDay.move({ weekIndex, dayIndex })}
        onClose={closeSkip}
      />
    );
  }

  // ── Render: main action picker ───────────────────────────────────────────
  const dayLabel = `Week ${weekIndex + 1} · Day ${dayIndex + 1}`;

  return (
    <Modal open={open} onClose={handleClose} title={dayLabel}>
      <div className="space-y-3">
        {workoutTemplate && !workoutDone && (
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center gap-2 min-w-0">
              <Dumbbell className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium truncate">{workoutTemplate.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                onClick={() => openSkip("workout")}
              >
                <SkipForward className="h-3.5 w-3.5" />
                Skip
              </Button>
              <Button
                size="sm"
                className="gap-1.5 flex-1"
                loading={startMutation.isPending}
                onClick={() => startMutation.mutate()}
              >
                <Play className="h-3.5 w-3.5" />
                Start strength
              </Button>
            </div>
            {startMutation.isError && (
              <p className="text-xs text-destructive">
                {startMutation.error instanceof Error
                  ? startMutation.error.message
                  : "Failed to start session."}
              </p>
            )}
          </div>
        )}

        {cardioTemplate && !cardioDone && (
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center gap-2 min-w-0">
              <Activity className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-sm font-medium truncate">{cardioTemplate.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                onClick={() => openSkip("cardio")}
              >
                <SkipForward className="h-3.5 w-3.5" />
                Skip
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 flex-1"
                onClick={() => setCardioFormOpen(true)}
              >
                <Activity className="h-3.5 w-3.5" />
                Log cardio
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
