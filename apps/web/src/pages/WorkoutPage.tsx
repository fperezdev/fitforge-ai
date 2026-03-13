import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Play, ListChecks, Dumbbell, SkipForward, CheckCircle2, ChevronRight } from "lucide-react";
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

interface PlanDay {
  id: string;
  dayNumber: number;
  type: string;
  workoutTemplate: { id: string; name: string } | null;
  cardioTemplate: { id: string; name: string } | null;
}

interface Microcycle {
  position: number; // 1-based
  days: PlanDay[];
}

interface ActivePlan {
  id: string;
  name: string;
  microcycleLength: number;
  mesocycleLength: number;
  startDate: string | null;
  activatedAt: string | null;
  microcycles: Microcycle[];
}

// Resolve a scheduled date for a zero-based (weekIndex, dayIndex) slot
function slotDate(plan: ActivePlan, weekIndex: number, dayIndex: number): Date {
  const anchor = plan.startDate
    ? new Date(plan.startDate + "T00:00:00")
    : new Date(plan.activatedAt!);
  const pos = weekIndex * plan.microcycleLength + dayIndex;
  const d = new Date(anchor);
  d.setDate(d.getDate() + pos);
  return d;
}

function getDateLabel(date: Date): { label: string; isToday: boolean } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  const formatted = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (diffDays === 0) return { label: `Today · ${formatted}`, isToday: true };
  if (diffDays === 1) return { label: `Tomorrow · ${formatted}`, isToday: false };
  return { label: formatted, isToday: false };
}

interface NextDay {
  planDayId: string;
  weekIndex: number;
  dayIndex: number;
  date: Date;
  workoutTemplate: { id: string; name: string };
}

// Find the next calendar day (from today) that has a workout template
function findNextStrengthDay(plan: ActivePlan): NextDay | null {
  if (!plan.activatedAt && !plan.startDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalDays = plan.microcycleLength * plan.mesocycleLength;

  for (let offset = 0; offset < totalDays; offset++) {
    const anchor = plan.startDate
      ? new Date(plan.startDate + "T00:00:00")
      : new Date(plan.activatedAt!);
    anchor.setHours(0, 0, 0, 0);
    const msPerDay = 86_400_000;
    const daysSinceAnchor = Math.floor((today.getTime() - anchor.getTime()) / msPerDay);
    const pos = daysSinceAnchor + offset;
    const weekIndex = Math.floor(pos / plan.microcycleLength) % plan.mesocycleLength;
    const dayIndex = pos % plan.microcycleLength;

    const week = plan.microcycles.find((mc) => mc.position === weekIndex + 1);
    const day = week?.days.find((d) => d.dayNumber === dayIndex + 1);
    if (!day || day.type !== "training" || !day.workoutTemplate) continue;

    return {
      planDayId: day.id,
      weekIndex,
      dayIndex,
      date: slotDate(plan, weekIndex, dayIndex),
      workoutTemplate: day.workoutTemplate,
    };
  }
  return null;
}

export function WorkoutPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

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
  const nextStrength = activePlan ? findNextStrengthDay(activePlan) : null;
  const { label: dateLabel, isToday } = nextStrength
    ? getDateLabel(new Date(nextStrength.date))
    : { label: "", isToday: false };

  function openConfirmFromSuggestion() {
    if (!nextStrength) return;
    setPendingTemplateId(nextStrength.workoutTemplate.id);
    setPendingTemplateName(nextStrength.workoutTemplate.name);
    setPendingPlanDayId(nextStrength.planDayId);
    setPendingWeekIndex(nextStrength.weekIndex);
    setPendingDayIndex(nextStrength.dayIndex);
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
              <Button size="sm" onClick={() => navigate(`/workout/${activeSession.id}`)}>
                Resume
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan suggestion — strength only */}
      {!activeSession && (
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
                    <p className="font-medium text-amber-800 dark:text-amber-200">Workout skipped</p>
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
                    <p className="font-medium text-emerald-800 dark:text-emerald-200">Workout moved</p>
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
                          {isToday ? "Today's plan" : "Upcoming"} · {activePlan.name}
                        </p>
                        <p className="font-medium truncate">{nextStrength.workoutTemplate.name}</p>
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
                        onClick={skipDay.openConfirm}
                        disabled={!isToday}
                        aria-label="Skip today's workout"
                      >
                        <SkipForward className="h-3.5 w-3.5" />
                        Skip
                      </Button>
                      <Button size="sm" onClick={openConfirmFromSuggestion} disabled={!isToday}>
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
                        <Badge variant={session.status === "completed" ? "success" : "secondary"}>
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
      <Modal open={confirmModal} onClose={closeConfirmModal} title="Start today's workout?">
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
            <Button variant="outline" onClick={closeConfirmModal}>Cancel</Button>
            <Button onClick={() => startMutation.mutate()} loading={startMutation.isPending}>
              <Play className="h-4 w-4" />
              Start
            </Button>
          </div>
        </div>
      </Modal>

      {/* Skip / Move workout modal */}
      {nextStrength && isToday && (
        <SkipDayModal
          open={skipDay.confirmOpen}
          workoutName={nextStrength.workoutTemplate.name}
          weekIndex={nextStrength.weekIndex}
          dayIndex={nextStrength.dayIndex}
          isPending={skipDay.isPending}
          isSkipError={skipDay.isSkipError}
          isMoveError={skipDay.isMoveError}
          onSkip={() => skipDay.skip({
            weekIndex: nextStrength.weekIndex,
            dayIndex: nextStrength.dayIndex,
            component: "workout",
          })}
          onMove={() => skipDay.move({
            weekIndex: nextStrength.weekIndex,
            dayIndex: nextStrength.dayIndex,
          })}
          onClose={skipDay.closeConfirm}
        />
      )}
    </div>
  );
}
