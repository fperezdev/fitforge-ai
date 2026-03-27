import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Scale, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { WeightEntry } from "@fitforge/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/ui/date-picker";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function BodyPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [date, setDate] = useState(todayISO);
  const [weightInput, setWeightInput] = useState("");

  const { data: entries = [], isLoading } = useQuery<WeightEntry[]>({
    queryKey: ["weight"],
    queryFn: () => api.get("/body/weight?limit=90"),
  });

  const logMutation = useMutation({
    mutationFn: (payload: { date: string; weightKg: number }) => api.post("/body/weight", payload),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ["weight"] });
      const previous = queryClient.getQueryData<WeightEntry[]>(["weight"]);
      // Optimistically append a placeholder entry
      queryClient.setQueryData<WeightEntry[]>(["weight"], (prev = []) => [
        ...prev,
        {
          id: `optimistic-${Date.now()}`,
          userId: "",
          date: payload.date,
          weightKg: payload.weightKg,
          notes: null,
        },
      ]);
      closeModal();
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["weight"], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["weight"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (entryDate: string) => api.delete(`/body/weight/${entryDate}`),
    onMutate: async (entryDate) => {
      await queryClient.cancelQueries({ queryKey: ["weight"] });
      const previous = queryClient.getQueryData<WeightEntry[]>(["weight"]);
      queryClient.setQueryData<WeightEntry[]>(["weight"], (prev = []) =>
        prev.filter((e) => e.date !== entryDate),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["weight"], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["weight"] }),
  });

  function openModal() {
    setDate(todayISO());
    setWeightInput("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setDate(todayISO());
    setWeightInput("");
  }

  function handleSubmit() {
    const kg = parseFloat(weightInput);
    if (!date || isNaN(kg) || kg <= 0) return;
    logMutation.mutate({ date, weightKg: kg });
  }

  const chartData = entries.map((e) => ({
    date: e.date.slice(5),
    kg: Number(e.weightKg),
  }));

  // History list — latest first (entries come oldest-first from API)
  const history = [...entries].reverse().slice(0, 30);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
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
            <Skeleton className="h-5 w-20" />
          </CardHeader>
          <CardContent className="space-y-3 py-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Body</h1>
          <p className="text-muted-foreground text-sm mt-1">Track your bodyweight over time.</p>
        </div>
        <Button onClick={openModal} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Log weight
        </Button>
      </div>

      {/* Empty state */}
      {entries.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Scale className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-lg">No weight entries yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Log your first weigh-in to start tracking your progress.
                </p>
              </div>
              <Button onClick={openModal} className="mt-2 gap-2">
                <Plus className="h-4 w-4" />
                Log weight
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chart */}
      {chartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="h-4 w-4 text-muted-foreground" />
              Weight trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
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

      {/* History list */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul>
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between px-6 py-3 border-b border-border last:border-0"
                >
                  <span className="text-sm text-muted-foreground">{formatDate(entry.date)}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium">
                      {Number(entry.weightKg).toFixed(1)} kg
                    </span>
                    <button
                      onClick={() => deleteMutation.mutate(entry.date)}
                      disabled={deleteMutation.isPending}
                      aria-label={`Delete entry for ${entry.date}`}
                      className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Log weight modal */}
      <Modal open={modalOpen} onClose={closeModal} title="Log weight">
        <div className="space-y-4">
          <DatePicker label="Date" value={date} onChange={setDate} toDate={new Date()} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="weight-kg" className="text-sm font-medium text-foreground">
              Weight (kg)
            </label>
            <input
              id="weight-kg"
              type="number"
              step="0.1"
              min="0"
              placeholder="e.g. 75.5"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {logMutation.isError && (
            <p className="text-sm text-destructive">
              {logMutation.error instanceof Error
                ? logMutation.error.message
                : "Failed to save entry. Please try again."}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!date || !weightInput || logMutation.isPending}
              loading={logMutation.isPending}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
