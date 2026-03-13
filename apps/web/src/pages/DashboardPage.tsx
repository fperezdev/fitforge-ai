import { useQuery } from "@tanstack/react-query";
import {
  Flame,
  Dumbbell,
  Calendar,
  TrendingUp,
  ArrowRight,
  ListChecks,
  BedDouble,
  SkipForward,
  CheckCircle2,
  Activity,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SkipDayModal } from "@/components/ui/skip-day-modal";
import { useSkipDay } from "@/hooks/useSkipDay";

interface Stats {
  weeklySessionCount: number;
  totalSessions: number;
  currentStreak: number;
  lastSession: { name: string; completedAt: string } | null;
}

interface WeightEntry {
  date: string;
  weightKg: string;
}

interface SuggestedDay {
  planDayId: string;
  weekIndex: number;
  dayIndex: number;
  scheduledDate: string; // YYYY-MM-DD
  type: string;
  workoutTemplate: { id: string; name: string } | null;
  cardioTemplate: { id: string; name: string } | null;
}

interface ActivePlan {
  id: string;
  name: string;
  suggestedDay: SuggestedDay | null;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivePlanCard({ plan }: { plan: ActivePlan }) {
  const day = plan.suggestedDay;
  const isRest = !day || day.type === "rest";
  const isTraining = !isRest;
  const weekLabel = day ? `Week ${day.weekIndex + 1} · Day ${day.dayIndex + 1}` : null;

  const scheduledDateLabel = day?.scheduledDate
    ? new Date(day.scheduledDate + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : null;

  const hasWorkout = isTraining && !!day?.workoutTemplate;
  const hasCardio = isTraining && !!day?.cardioTemplate;

  const skipDay = useSkipDay();

  return (
    <>
      {/* Post-skip feedback banner */}
      {skipDay.skipped && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-amber-800 dark:text-amber-200">Day skipped</p>
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

      {/* Current/next suggested day */}
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="py-4 space-y-3">
          {/* Plan header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-primary/10 text-primary shrink-0 mt-0.5">
                {isRest ? (
                  <BedDouble className="h-4 w-4" />
                ) : (
                  <ListChecks className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Today's plan
                </p>
                <p className="font-semibold truncate">{plan.name}</p>
                {weekLabel && (
                  <p className="text-sm text-muted-foreground">
                    {weekLabel}
                    {scheduledDateLabel && (
                      <span className="ml-2 text-xs">· {scheduledDateLabel}</span>
                    )}
                  </p>
                )}
                {isRest && (
                  <p className="text-sm text-muted-foreground mt-0.5">Rest day — recover well</p>
                )}
              </div>
            </div>

            {isTraining && day && (
              <Button
                size="sm"
                variant="ghost"
                onClick={skipDay.openConfirm}
                aria-label="Skip today's day"
                className="shrink-0"
              >
                <SkipForward className="h-3.5 w-3.5" />
                Skip
              </Button>
            )}
          </div>

          {/* Workout row */}
          {hasWorkout && day && (
            <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/40">
              <div className="flex items-center gap-2 min-w-0">
                <Dumbbell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{day.workoutTemplate!.name}</span>
              </div>
              <Button size="sm" asChild className="shrink-0">
                <Link
                  to="/workout/new"
                  state={{
                    templateId: day.workoutTemplate!.id,
                    templateName: day.workoutTemplate!.name,
                    planDayId: day.planDayId,
                    weekIndex: day.weekIndex,
                    dayIndex: day.dayIndex,
                  }}
                >
                  Start
                </Link>
              </Button>
            </div>
          )}

          {/* Cardio row */}
          {hasCardio && day && (
            <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/40">
              <div className="flex items-center gap-2 min-w-0">
                <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{day.cardioTemplate!.name}</span>
              </div>
              <Button size="sm" variant="outline" asChild className="shrink-0">
                <Link to="/cardio">Go to Cardio</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {day && isTraining && (
        <SkipDayModal
          open={skipDay.confirmOpen}
          workoutName={day.workoutTemplate?.name ?? day.cardioTemplate?.name ?? null}
          weekIndex={day.weekIndex}
          dayIndex={day.dayIndex}
          isPending={skipDay.isPending}
          isError={skipDay.isError}
          onConfirm={() => skipDay.skip({ weekIndex: day.weekIndex, dayIndex: day.dayIndex })}
          onClose={skipDay.closeConfirm}
        />
      )}
    </>
  );
}

export function DashboardPage() {
  const { data: stats } = useQuery<Stats>({
    queryKey: ["stats"],
    queryFn: () => api.get("/me/stats"),
  });

  const { data: weight } = useQuery<WeightEntry[]>({
    queryKey: ["weight"],
    queryFn: () => api.get("/body/weight?limit=30"),
  });

  const { data: activePlan } = useQuery<ActivePlan | null>({
    queryKey: ["activePlan"],
    queryFn: () => api.get("/plans/active"),
  });
  const weightData = weight?.map((w) => ({
    date: w.date.slice(5), // MM-DD
    kg: Number(w.weightKg),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Flame}
          label="Streak"
          value={`${stats?.currentStreak ?? 0}d`}
          sub="consecutive days"
          color="bg-orange-500/10 text-orange-500"
        />
        <StatCard
          icon={Calendar}
          label="This week"
          value={stats?.weeklySessionCount ?? 0}
          sub="sessions"
          color="bg-blue-500/10 text-blue-500"
        />
        <StatCard
          icon={Dumbbell}
          label="Total sessions"
          value={stats?.totalSessions ?? 0}
          color="bg-violet-500/10 text-violet-500"
        />
        <StatCard
          icon={TrendingUp}
          label="Last session"
          value={
            stats?.lastSession
              ? new Date(stats.lastSession.completedAt).toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric" }
                )
              : "—"
          }
          sub={stats?.lastSession?.name ?? ""}
          color="bg-emerald-500/10 text-emerald-500"
        />
      </div>

      {/* Active plan suggestion */}
      {activePlan && <ActivePlanCard plan={activePlan} />}

      {/* Quick actions */}
      <div>
        <h2 className="font-semibold mb-3">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" asChild>
            <Link to="/cardio">
              Log run
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/coach">
              Ask AI coach
            </Link>
          </Button>
        </div>
      </div>

      {/* Weight chart */}
      {weightData && weightData.length > 1 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Weight trend</CardTitle>
              <Badge variant="secondary">
                {weightData.length} entries
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weightData}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}kg`}
                />
                <Tooltip
                  formatter={(v) => [`${v} kg`, "Weight"]}
                  contentStyle={{
                    borderRadius: "8px",
                    fontSize: "12px",
                    border: "1px solid var(--border)",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="kg"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Last session */}
      {stats?.lastSession && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Last workout</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/workout">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{stats.lastSession.name}</p>
            <p className="text-sm text-muted-foreground">
              {new Date(stats.lastSession.completedAt).toLocaleDateString(
                "en-US",
                { weekday: "long", month: "long", day: "numeric" }
              )}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
