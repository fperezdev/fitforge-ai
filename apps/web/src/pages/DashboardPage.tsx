import { useQuery } from "@tanstack/react-query";
import { Flame, Dumbbell, Activity, SkipForward } from "lucide-react";
import { Link } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "@/lib/api";
import type { WeightEntry } from "@fitforge/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface Stats {
  weeklyStrengthCount: number;
  weeklyCardioCount: number;
  plannedStrengthPerWeek: number;
  plannedCardioPerWeek: number;
  skippedCount: number;
  currentStreak: number;
}

export function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["stats"],
    queryFn: () => api.get("/me/stats"),
  });

  const { data: weight, isLoading: weightLoading } = useQuery<WeightEntry[]>({
    queryKey: ["weight"],
    queryFn: () => api.get("/body/weight?limit=30"),
  });

  const isLoading = statsLoading || weightLoading;

  const weightData = weight?.map((w) => ({
    date: w.date.slice(5),
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
      <div className="grid grid-cols-2 gap-4">
        {isLoading ? (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        ) : (
          <>
            {/* Streak */}
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-orange-500/10 text-orange-500 shrink-0">
                    <Flame className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Streak</p>
                    <p className="text-2xl font-bold">{stats?.currentStreak ?? 0}d</p>
                    <p className="text-xs text-muted-foreground">consecutive</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Skipped */}
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-slate-500/10 text-slate-500 shrink-0">
                    <SkipForward className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Skipped</p>
                    <p className="text-2xl font-bold">{stats?.skippedCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground">this plan</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Strength this week */}
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-violet-500/10 text-violet-500 shrink-0">
                    <Dumbbell className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Strength</p>
                    <p className="text-2xl font-bold">
                      {stats?.weeklyStrengthCount ?? 0}
                      {(stats?.plannedStrengthPerWeek ?? 0) > 0 && (
                        <span className="text-base font-normal text-muted-foreground">
                          /{stats?.plannedStrengthPerWeek}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">this week</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cardio this week */}
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-blue-500/10 text-blue-500 shrink-0">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Cardio</p>
                    <p className="text-2xl font-bold">
                      {stats?.weeklyCardioCount ?? 0}
                      {(stats?.plannedCardioPerWeek ?? 0) > 0 && (
                        <span className="text-base font-normal text-muted-foreground">
                          /{stats?.plannedCardioPerWeek}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">this week</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="font-semibold mb-3">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" asChild>
            <Link to="/coach">Ask AI coach</Link>
          </Button>
        </div>
      </div>

      {/* Weight chart */}
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : weightData && weightData.length > 1 ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Weight trend</CardTitle>
              <Badge variant="secondary">{weightData.length} entries</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weightData}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
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
      ) : null}
    </div>
  );
}
