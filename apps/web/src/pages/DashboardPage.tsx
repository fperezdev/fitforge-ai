import { useQuery } from "@tanstack/react-query";
import {
  Flame,
  Dumbbell,
  Calendar,
  TrendingUp,
  ArrowRight,
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

export function DashboardPage() {
  const { data: stats } = useQuery<Stats>({
    queryKey: ["stats"],
    queryFn: () => api.get("/me/stats"),
  });

  const { data: weight } = useQuery<WeightEntry[]>({
    queryKey: ["weight"],
    queryFn: () => api.get("/body/weight?limit=30"),
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

      {/* Quick actions */}
      <div>
        <h2 className="font-semibold mb-3">Quick actions</h2>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/workout/new">
              <Dumbbell className="h-4 w-4" />
              Start workout
            </Link>
          </Button>
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
