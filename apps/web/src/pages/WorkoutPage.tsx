import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  Play,
  ListChecks,
  Dumbbell,
  SkipForward,
  CheckCircle2,
  ChevronRight,
  Clock,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { SkipDayModal } from "@/components/ui/skip-day-modal";
import { useSkipDay } from "@/hooks/useSkipDay";
import { formatDuration } from "@/lib/utils";
import {
  type ActivePlan,
  type NextDay,
  findNextDay,
  getPastPendingDays,
  getDateLabel,
} from "@/lib/planUtils";
import { Skeleton } from "@/components/ui/skeleton";

interface Session {
  id: string;
  name: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
}

export function WorkoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const routeState = location.state as {
    templateId?: string;
    templateName?: string;
    planDayId?: string;
    weekIndex?: number;
    dayIndex?: number;
  } | null;

  const [confirmModal, setConfirmModal] = useState(() => !!routeState?.planDayId);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(
    () => routeState?.templateId ?? null,
  );
  const [pendingTemplateName, setPendingTemplateName] = useState<string | null>(
    () => routeState?.templateName ?? null,
  );
  const [pendingPlanDayId, setPendingPlanDayId] = useState<string | null>(
    () => routeState?.planDayId ?? null,
  );
  const [pendingWeekIndex, setPendingWeekIndex] = useState<number | null>(
    () => routeState?.weekIndex ?? null,
  );
  const [pendingDayIndex, setPendingDayIndex] = useState<number | null>(
    () => routeState?.dayIndex ?? null,
  );

  // Track which day the skip modal is targeting (next-day card or a past-pending card)
  const [skipTarget, setSkipTarget] = useState<NextDay | null>(null);

  useEffect(() => {
    if ((location.state as typeof routeState)?.planDayId) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<Session[]>({
    queryKey: ["sessions"],
    queryFn: () => api.get("/sessions?limit=20"),
  });

  const { data: activePlan, isLoading: planLoading } = useQuery<ActivePlan | null>({
    queryKey: ["activePlan"],
    queryFn: () => api.get("/plans/active"),
  });

  const startMutation = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/sessions", {
        templateId: pendingTemplateId ?? undefined,
        planDayId: pendingPlanDayId,
        weekIndex: pendingWeekIndex,
        dayIndex: pendingDayIndex,
      }),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["activePlan"] });
      navigate(`/workout/${session.id}`);
    },
  });

  const skipDay = useSkipDay();

  const isLoading = sessionsLoading || planLoading;
  const activeSession = sessions.find((s) => s.status === "in_progress");
  const nextStrength = activePlan ? findNextDay(activePlan, "workout") : null;
  const pastPending = activePlan ? getPastPendingDays(activePlan, "workout") : [];

  const {
    label: dateLabel,
    isToday,
    isPast,
  } = nextStrength ? getDateLabel(nextStrength.date) : { label: "", isToday: false, isPast: false };

  const canActOnNext = isToday || isPast;

  // The active target for the skip modal
  const activeSkipTarget = skipTarget ?? nextStrength;

  function openConfirmForDay(day: NextDay) {
    setPendingTemplateId(day.template.id);
    setPendingTemplateName(day.template.name);
    setPendingPlanDayId(day.planDayId);
    setPendingWeekIndex(day.weekIndex);
    setPendingDayIndex(day.dayIndex);
    setConfirmModal(true);
  }

  function closeConfirmModal() {
    setConfirmModal(false);
    setPendingTemplateId(null);
    setPendingTemplateName(null);
    setPendingPlanDayId(null);
    setPendingWeekIndex(null);
    setPendingDayIndex(null);
  }

  function openSkipForDay(day: NextDay) {
    setSkipTarget(day);
    skipDay.openConfirm();
  }

  function closeSkipModal() {
    skipDay.closeConfirm();
    setSkipTarget(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Workouts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isLoading ? "\u00A0" : `${sessions.length} sessions logged`}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : (
        <>
          {activeSession && (
            <Card className="border-primary bg-primary/5">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Active session</p>
                    <p className="text-sm text-muted-foreground">
                      {activeSession.name ?? "Unnamed"}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => navigate(`/workout/${activeSession.id}`)}>
                    Resume
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {!activeSession && (
            <>
              {skipDay.skipped && (
                <Card className="border-amber-500/30 bg-amber-500/5">
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-amber-800 dark:text-amber-200">
                          Workout skipped
                        </p>
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

              {skipDay.moved && (
                <Card className="border-emerald-500/30 bg-emerald-500/5">
                  <CardContent className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-emerald-800 dark:text-emerald-200">
                          Workout moved
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

              {activePlan ? (
                nextStrength ? (
                  <Card className="border-primary/40 bg-primary/5">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary shrink-0">
                            <ListChecks className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                              {isToday ? "Today's plan" : isPast ? "Pending" : "Upcoming"} ·{" "}
                              {activePlan.name}
                            </p>
                            <p className="font-medium truncate">{nextStrength.template.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Week {nextStrength.weekIndex + 1} · Day {nextStrength.dayIndex + 1}
                              <span className="ml-2">· {dateLabel}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openSkipForDay(nextStrength)}
                            disabled={!canActOnNext}
                            aria-label="Skip this workout"
                          >
                            <SkipForward className="h-3.5 w-3.5" />
                            Skip
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => openConfirmForDay(nextStrength)}
                            disabled={!canActOnNext}
                          >
                            <Play className="h-3 w-3" />
                            Start
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-dashed">
                    <CardContent className="py-6 text-center text-sm text-muted-foreground">
                      No strength workouts in your plan.
                    </CardContent>
                  </Card>
                )
              ) : (
                <Card className="border-dashed">
                  <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                      <Dumbbell className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium">No active training plan</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Activate a plan to start tracking workouts.
                      </p>
                    </div>
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/planner">Go to Plans</Link>
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Past pending workouts from the current week */}
              {pastPending.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
                    Pending this week
                  </p>
                  {pastPending.map((day) => {
                    const { label: dayLabel } = getDateLabel(day.date);
                    return (
                      <Card key={`${day.weekIndex}:${day.dayIndex}`} className="border-border/60">
                        <CardContent className="py-3">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="h-7 w-7 rounded-md flex items-center justify-center bg-muted text-muted-foreground shrink-0">
                                <Clock className="h-3.5 w-3.5" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">{day.template.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  Week {day.weekIndex + 1} · Day {day.dayIndex + 1}
                                  <span className="ml-2">· {dayLabel}</span>
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openSkipForDay(day)}
                                aria-label="Skip this workout"
                              >
                                <SkipForward className="h-3.5 w-3.5" />
                                Skip
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openConfirmForDay(day)}
                              >
                                <Play className="h-3 w-3" />
                                Start
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div className="space-y-3">
            {sessions.filter((s) => s.status !== "in_progress").length === 0 && !activeSession && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No sessions logged yet.
              </p>
            )}
            {sessions
              .filter((s) => s.status !== "in_progress")
              .map((session) => {
                const duration = session.completedAt
                  ? Math.floor(
                      (new Date(session.completedAt).getTime() -
                        new Date(session.startedAt).getTime()) /
                        1000,
                    )
                  : null;
                return (
                  <Link key={session.id} to={`/workout/history/${session.id}`}>
                    <Card className="hover:border-primary/40 transition-colors">
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{session.name ?? "Unnamed session"}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(session.startedAt).toLocaleDateString("en-US", {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })}
                              {duration && ` · ${formatDuration(duration)}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={session.status === "completed" ? "success" : "secondary"}
                            >
                              {session.status}
                            </Badge>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
          </div>
        </>
      )}

      <Modal open={confirmModal} onClose={closeConfirmModal} title="Start workout?">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {pendingTemplateName ? (
              <>
                This will start a session using the{" "}
                <span className="font-medium text-foreground">{pendingTemplateName}</span> template
                from your active plan.
              </>
            ) : (
              "This will start a session for this plan day."
            )}
          </p>
          {startMutation.isError && (
            <p className="text-sm text-destructive">
              {startMutation.error instanceof Error
                ? startMutation.error.message
                : "Failed to start session."}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={closeConfirmModal}>
              Cancel
            </Button>
            <Button onClick={() => startMutation.mutate()} loading={startMutation.isPending}>
              <Play className="h-4 w-4" />
              Start
            </Button>
          </div>
        </div>
      </Modal>

      {activeSkipTarget && (
        <SkipDayModal
          open={skipDay.confirmOpen}
          workoutName={activeSkipTarget.template.name}
          weekIndex={activeSkipTarget.weekIndex}
          dayIndex={activeSkipTarget.dayIndex}
          isPending={skipDay.isPending}
          isSkipError={skipDay.isSkipError}
          isMoveError={skipDay.isMoveError}
          onSkip={(notes) =>
            skipDay.skip({
              weekIndex: activeSkipTarget.weekIndex,
              dayIndex: activeSkipTarget.dayIndex,
              component: "workout",
              notes,
            })
          }
          onMove={() =>
            skipDay.move({
              weekIndex: activeSkipTarget.weekIndex,
              dayIndex: activeSkipTarget.dayIndex,
            })
          }
          onClose={closeSkipModal}
        />
      )}
    </div>
  );
}
