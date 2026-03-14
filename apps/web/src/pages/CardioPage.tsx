import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Activity, SkipForward, CheckCircle2, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import type { CardioSession } from "@fitforge/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { SkipDayModal } from "@/components/ui/skip-day-modal";
import { useSkipDay } from "@/hooks/useSkipDay";
import { formatDistance, formatDuration, formatPace } from "@/lib/utils";
import { type ActivePlan, findNextDay, getDateLabel } from "@/lib/planUtils";

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

export function CardioPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const [planDayId, setPlanDayId] = useState<string | null>(null);
  const [planWeekIndex, setPlanWeekIndex] = useState<number | null>(null);
  const [planDayIndex, setPlanDayIndex] = useState<number | null>(null);

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<CardioSession[]>({
    queryKey: ["cardio"],
    queryFn: () => api.get("/cardio?limit=30"),
  });

  const { data: activePlan, isLoading: planLoading } = useQuery<ActivePlan | null>({
    queryKey: ["activePlan"],
    queryFn: () => api.get("/plans/active"),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<CardioForm>({
    resolver: zodResolver(cardioSchema),
    defaultValues: { type: "run" },
  });

  const skipDay = useSkipDay();

  const logMutation = useMutation({
    mutationFn: (data: CardioForm) =>
      api.post("/cardio", {
        ...toApiPayload(data),
        ...(planDayId != null
          ? { planDayId, weekIndex: planWeekIndex, dayIndex: planDayIndex }
          : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cardio"] });
      queryClient.invalidateQueries({ queryKey: ["activePlan"] });
      setModalOpen(false);
      reset();
      setPlanDayId(null);
      setPlanWeekIndex(null);
      setPlanDayIndex(null);
    },
  });

  const nextCardio = activePlan ? findNextDay(activePlan, "cardio") : null;
  const { label: dateLabel, isToday } = nextCardio
    ? getDateLabel(nextCardio.date)
    : { label: "", isToday: false };

  if (sessionsLoading || planLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  function openFromSuggestion() {
    if (!nextCardio) return;
    setPlanDayId(nextCardio.planDayId);
    setPlanWeekIndex(nextCardio.weekIndex);
    setPlanDayIndex(nextCardio.dayIndex);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setPlanDayId(null);
    setPlanWeekIndex(null);
    setPlanDayIndex(null);
    reset({ type: "run" });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cardio</h1>
        <p className="text-sm text-muted-foreground mt-1">{sessions.length} sessions</p>
      </div>

      {/* No active plan banner */}
      {activePlan === null && (
        <Card className="border-dashed">
          <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
              <Activity className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No active training plan</p>
              <p className="text-sm text-muted-foreground mt-1">
                Activate a plan to start tracking cardio.
              </p>
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link to="/planner">Go to Plans</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Plan suggestion — cardio only */}
      {activePlan && (
        <>
          {/* Post-skip feedback */}
          {skipDay.skipped && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-amber-800 dark:text-amber-200">Cardio skipped</p>
                    <p className="text-sm text-amber-700/70 dark:text-amber-300/70 mt-0.5">
                      Your next planned session is shown below.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-amber-700 hover:text-amber-900 dark:text-amber-300"
                    onClick={skipDay.resetSkipped}
                  >
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Post-move feedback */}
          {skipDay.moved && (
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-emerald-800 dark:text-emerald-200">
                      Cardio moved
                    </p>
                    <p className="text-sm text-emerald-700/70 dark:text-emerald-300/70 mt-0.5">
                      Your schedule has shifted forward by one day.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-emerald-700 hover:text-emerald-900 dark:text-emerald-300"
                    onClick={skipDay.resetMoved}
                  >
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {nextCardio ? (
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary shrink-0">
                      <Activity className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                        {isToday ? "Today's plan" : "Upcoming"} · {activePlan.name}
                      </p>
                      <p className="font-medium truncate">{nextCardio.template.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Week {nextCardio.weekIndex + 1} · Day {nextCardio.dayIndex + 1}
                        <span className="ml-2">· {dateLabel}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={skipDay.openConfirm}
                      disabled={!isToday}
                      aria-label="Skip today's cardio"
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                      Skip
                    </Button>
                    <Button size="sm" onClick={openFromSuggestion} disabled={!isToday}>
                      Log cardio
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                No cardio sessions in your plan.
              </CardContent>
            </Card>
          )}

          {nextCardio && isToday && (
            <SkipDayModal
              open={skipDay.confirmOpen}
              workoutName={nextCardio.template.name}
              weekIndex={nextCardio.weekIndex}
              dayIndex={nextCardio.dayIndex}
              isPending={skipDay.isPending}
              isSkipError={skipDay.isSkipError}
              isMoveError={skipDay.isMoveError}
              onSkip={(notes) =>
                skipDay.skip({
                  weekIndex: nextCardio.weekIndex,
                  dayIndex: nextCardio.dayIndex,
                  component: "cardio",
                  notes,
                })
              }
              onMove={() =>
                skipDay.move({
                  weekIndex: nextCardio.weekIndex,
                  dayIndex: nextCardio.dayIndex,
                })
              }
              onClose={skipDay.closeConfirm}
            />
          )}
        </>
      )}

      <div className="space-y-3">
        {sessions.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No sessions logged yet.</p>
        )}
        {sessions.map((s) => (
          <Link key={s.id} to={`/cardio/${s.id}`}>
            <Card className="hover:border-primary/40 transition-colors">
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium capitalize">{s.type}</span>
                      {s.distanceMeters && (
                        <Badge variant="secondary">{formatDistance(s.distanceMeters)}</Badge>
                      )}
                      {s.avgPaceSecondsPerKm && (
                        <Badge variant="secondary">{formatPace(s.avgPaceSecondsPerKm)} /km</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {new Date(s.startedAt).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                      {s.durationSeconds && ` · ${formatDuration(s.durationSeconds)}`}
                      {s.avgHeartRate && ` · ♥ ${s.avgHeartRate} bpm`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.caloriesBurned && (
                      <span className="text-sm text-muted-foreground">{s.caloriesBurned} kcal</span>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Modal open={modalOpen} onClose={closeModal} title="Log cardio">
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
          {planDayId && (
            <p className="text-xs text-muted-foreground">
              This session will be linked to your active plan.
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting || logMutation.isPending}>
              Log session
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
