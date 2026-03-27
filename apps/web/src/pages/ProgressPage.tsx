import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Dumbbell, TrendingUp, Ruler } from "lucide-react";
import { api } from "@/lib/api";
import { muscleLabel } from "@/lib/muscleLabels";
import type { WeightEntry } from "@fitforge/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface PR {
  id: string;
  type: string;
  value: string;
  achievedAt: string;
  exercise: { name: string; primaryMuscle: string };
}

interface BodyMeasurement {
  id: string;
  date: string;
  bodyFatPercent: string | null;
  waistCm: string | null;
  chestCm: string | null;
}

export function ProgressPage() {
  const { data: prs = [], isLoading: prsLoading } = useQuery<PR[]>({
    queryKey: ["prs"],
    queryFn: () => api.get("/me/records"),
  });

  const { data: weight = [], isLoading: weightLoading } = useQuery<WeightEntry[]>({
    queryKey: ["weight"],
    queryFn: () => api.get("/body/weight?limit=90"),
  });

  const { data: measurements = [], isLoading: measurementsLoading } = useQuery<BodyMeasurement[]>({
    queryKey: ["measurements"],
    queryFn: () => api.get("/body/measurements"),
  });

  const isLoading = prsLoading || weightLoading || measurementsLoading;

  const weightData = weight.map((w) => ({
    date: w.date.slice(5),
    kg: Number(w.weightKg),
  }));

  // Group PRs by exercise, take the latest
  const prMap = new Map<string, PR>();
  for (const pr of prs) {
    const key = pr.exercise.name;
    if (!prMap.has(key) || new Date(pr.achievedAt) > new Date(prMap.get(key)!.achievedAt)) {
      prMap.set(key, pr);
    }
  }
  const latestPRs = Array.from(prMap.values()).sort((a, b) => Number(b.value) - Number(a.value));

  const isEmpty = weightData.length <= 1 && latestPRs.length === 0 && measurements.length === 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Progress</h1>
        {!isEmpty && (
          <p className="text-muted-foreground text-sm mt-1">
            Track your strength, weight, and body measurements over time.
          </p>
        )}
      </div>

      {/* Loading skeletons */}
      {isLoading && (
        <>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[220px]" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-48" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </CardContent>
          </Card>
        </>
      )}

      {/* Empty state */}
      {!isLoading && isEmpty && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-lg">No progress data yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Start logging workouts to track your personal records, body weight, and
                  measurements.
                </p>
              </div>
              <Button asChild className="mt-2">
                <Link to="/workout">Start a workout</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weight chart */}
      {!isLoading && weightData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Body weight
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={weightData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
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
                    background: "var(--card)",
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

      {/* Personal Records */}
      {!isLoading && (!isEmpty || latestPRs.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-muted-foreground" />
              Personal records (estimated 1RM)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {latestPRs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No records yet. Log some workouts to track your PRs.
              </p>
            ) : (
              <div className="space-y-2">
                {latestPRs.map((pr) => (
                  <div
                    key={pr.id}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  >
                    <div>
                      <p className="font-medium text-sm">{pr.exercise.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(pr.achievedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="success">{Number(pr.value).toFixed(1)} kg</Badge>
                      <Badge variant="secondary">
                        {pr.exercise.primaryMuscle ? muscleLabel(pr.exercise.primaryMuscle) : "—"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Body measurements */}
      {!isLoading && measurements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ruler className="h-4 w-4 text-muted-foreground" />
              Body measurements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {measurements.slice(0, 10).map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0 text-sm"
                >
                  <span className="text-muted-foreground">{m.date}</span>
                  <div className="flex gap-3">
                    {m.bodyFatPercent && <span>BF: {Number(m.bodyFatPercent).toFixed(1)}%</span>}
                    {m.waistCm && <span>Waist: {Number(m.waistCm).toFixed(1)} cm</span>}
                    {m.chestCm && <span>Chest: {Number(m.chestCm).toFixed(1)} cm</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
