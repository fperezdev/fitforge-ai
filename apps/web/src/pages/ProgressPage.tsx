import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PR {
  id: string;
  type: string;
  value: string;
  achievedAt: string;
  exercise: { name: string; category: string };
}

interface WeightEntry {
  date: string;
  weightKg: string;
}

interface BodyMeasurement {
  id: string;
  date: string;
  bodyFatPercent: string | null;
  waistCm: string | null;
  chestCm: string | null;
}

export function ProgressPage() {
  const { data: prs = [] } = useQuery<PR[]>({
    queryKey: ["prs"],
    queryFn: () => api.get("/me/records"),
  });

  const { data: weight = [] } = useQuery<WeightEntry[]>({
    queryKey: ["weight"],
    queryFn: () => api.get("/body/weight?limit=90"),
  });

  const { data: measurements = [] } = useQuery<BodyMeasurement[]>({
    queryKey: ["measurements"],
    queryFn: () => api.get("/body/measurements"),
  });

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
  const latestPRs = Array.from(prMap.values()).sort(
    (a, b) => Number(b.value) - Number(a.value)
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Progress</h1>

      {/* Weight chart */}
      {weightData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Body weight</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={weightData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
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
      <Card>
        <CardHeader>
          <CardTitle>Personal records (estimated 1RM)</CardTitle>
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
                    <Badge variant="success">
                      {Number(pr.value).toFixed(1)} kg
                    </Badge>
                    <Badge variant="secondary">{pr.exercise.category}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Body measurements */}
      {measurements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Body measurements</CardTitle>
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
                    {m.bodyFatPercent && (
                      <span>BF: {Number(m.bodyFatPercent).toFixed(1)}%</span>
                    )}
                    {m.waistCm && (
                      <span>Waist: {Number(m.waistCm).toFixed(1)} cm</span>
                    )}
                    {m.chestCm && (
                      <span>Chest: {Number(m.chestCm).toFixed(1)} cm</span>
                    )}
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
