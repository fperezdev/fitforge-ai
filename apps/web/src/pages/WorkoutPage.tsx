import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Play, ListChecks, Dumbbell, SkipForward, CheckCircle2, Activity, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { SkipDayModal } from "@/components/ui/skip-day-modal";
import { useSkipDay } from "@/hooks/useSkipDay";
import { formatDuration } from "@/lib/utils";

interface Session {
  id: string;
  name: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
}

interface SuggestedDay {
  weekIndex: number;
  dayIndex: number;
  scheduledDate: string; // YYYY-MM-DD
  type: string;
  planDayId: string;
  workoutTemplate: { id: string; name: string } | null;
  cardioTemplate: { id: string; name: string } | null;
}

interface ActivePlan {
  id: string;
  name: string;
  suggestedDay: SuggestedDay | null;
}

export function WorkoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  // Confirmation modal state (only entry point to start a session)
  const [confirmModal, setConfirmModal] = useState(false);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [pendingTemplateName, setPendingTemplateName] = useState<string | null>(null);
  const [pendingPlanDayId, setPendingPlanDayId] = useState<string | null>(null);
  const [pendingWeekIndex, setPendingWeekIndex] = useState<number | null>(null);
  const [pendingDayIndex, setPendingDayIndex] = useState<number | null>(null);

  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ["sessions"],
    queryFn: () => api.get("/sessions?limit=20"),
  });

  const { data: activePlan } = useQuery<ActivePlan | null>({
    queryKey: ["activePlan"],
    queryFn: () => api.get("/plans/active"),
  });

  // If navigated here with a pre-selected suggestion (e.g., from dashboard), open confirm modal
  useEffect(() => {
    const state = location.state as {
      templateId?: string;
      templateName?: string;
      planDayId?: string;
      weekIndex?: number;
      dayIndex?: number;
    } | null;
    if (state?.planDayId) {
      setPendingTemplateId(state.templateId ?? null);
      setPendingTemplateName(state.templateName ?? null);
      setPendingPlanDayId(state.planDayId);
      setPendingWeekIndex(state.weekIndex ?? null);
      setPendingDayIndex(state.dayIndex ?? null);
      setConfirmModal(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, []);

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

  const activeSession = sessions.find((s) => s.status === "in_progress");
  const suggestedDay = activePlan?.suggestedDay;
  const isTrainingDay = suggestedDay?.type === "training";
  // Only show the workout suggestion when the day has a workout template
  const hasWorkout = isTrainingDay && !!suggestedDay?.workoutTemplate;
  const isCardioOnly = isTrainingDay && !suggestedDay?.workoutTemplate && !!suggestedDay?.cardioTemplate;

  function openConfirmFromSuggestion() {
    if (!suggestedDay?.workoutTemplate) return;
    setPendingTemplateId(suggestedDay.workoutTemplate.id);
    setPendingTemplateName(suggestedDay.workoutTemplate.name);
    setPendingPlanDayId(suggestedDay.planDayId);
    setPendingWeekIndex(suggestedDay.weekIndex);
    setPendingDayIndex(suggestedDay.dayIndex);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workouts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {sessions.length} sessions logged
          </p>
        </div>
      </div>

      {/* Active (in-progress) session banner */}
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
              <Button
                size="sm"
                onClick={() => navigate(`/workout/${activeSession.id}`)}
              >
                Resume
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan suggestion — workout only */}
      {!activeSession && (
        <>
          {/* Post-skip feedback banner */}
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

          {activePlan ? (
            hasWorkout ? (
              /* Workout suggestion card */
              <Card className="border-primary/40 bg-primary/5">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary shrink-0">
                        <ListChecks className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                          Today's plan · {activePlan.name}
                        </p>
                        <p className="font-medium truncate">{suggestedDay!.workoutTemplate!.name}</p>
                        {suggestedDay && (
                          <p className="text-xs text-muted-foreground">
                            Week {suggestedDay.weekIndex + 1} · Day {suggestedDay.dayIndex + 1}
                            {suggestedDay.scheduledDate && (
                              <span className="ml-2">
                                ·{" "}
                                {new Date(suggestedDay.scheduledDate + "T00:00:00").toLocaleDateString(
                                  undefined,
                                  { weekday: "short", month: "short", day: "numeric" }
                                )}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={skipDay.openConfirm}
                        aria-label="Skip today's workout"
                      >
                        <SkipForward className="h-3.5 w-3.5" />
                        Skip
                      </Button>
                      <Button size="sm" onClick={openConfirmFromSuggestion}>
                        <Play className="h-3 w-3" />
                        Start
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : isCardioOnly ? (
              /* Day is cardio-only — direct user to Cardio page */
              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                      <Activity className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">Cardio day</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Today's plan has a cardio session — no strength workout.
                      </p>
                    </div>
                    <Button size="sm" variant="outline" asChild className="shrink-0">
                      <Link to="/cardio">Go to Cardio</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : suggestedDay?.type === "rest" ? (
              <Card className="border-dashed">
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  Rest day — no workout today.
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  No strength workout assigned for today's plan day.
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
        </>
      )}

      {/* Session history */}
      <div className="space-y-3">
        {sessions.filter((s) => s.status !== "in_progress").length === 0 && !activeSession && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No sessions logged yet.
          </p>
        )}
        {sessions
          .filter((s) => s.status !== "in_progress")
          .map((session) => {
            const duration =
              session.completedAt
                ? Math.floor(
                    (new Date(session.completedAt).getTime() -
                      new Date(session.startedAt).getTime()) /
                      1000
                  )
                : null;

            return (
              <Link key={session.id} to={`/workout/history/${session.id}`}>
                <Card className="hover:border-primary/40 transition-colors">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">
                          {session.name ?? "Unnamed session"}
                        </p>
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
                          variant={
                            session.status === "completed" ? "success" : "secondary"
                          }
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

      {/* Start session confirmation modal */}
      <Modal
        open={confirmModal}
        onClose={closeConfirmModal}
        title="Start today's workout?"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {pendingTemplateName ? (
              <>
                This will start a session using the{" "}
                <span className="font-medium text-foreground">{pendingTemplateName}</span>{" "}
                template from your active plan.
              </>
            ) : (
              "This will start a session for today's plan day."
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
            <Button
              onClick={() => startMutation.mutate()}
              loading={startMutation.isPending}
            >
              <Play className="h-4 w-4" />
              Start
            </Button>
          </div>
        </div>
      </Modal>

      {/* Skip workout confirmation modal */}
      {suggestedDay && hasWorkout && (
        <SkipDayModal
          open={skipDay.confirmOpen}
          workoutName={suggestedDay.workoutTemplate?.name ?? null}
          weekIndex={suggestedDay.weekIndex}
          dayIndex={suggestedDay.dayIndex}
          isPending={skipDay.isPending}
          isError={skipDay.isError}
          onConfirm={() => skipDay.skip({
            weekIndex: suggestedDay.weekIndex,
            dayIndex: suggestedDay.dayIndex,
            component: "workout",
          })}
          onClose={skipDay.closeConfirm}
        />
      )}
    </div>
  );
}
