import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { formatDistance, formatDuration, formatPace } from "@/lib/utils";

interface CardioSession {
  id: string;
  type: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  avgPaceSecondsPerKm: number | null;
  avgHeartRate: number | null;
  caloriesBurned: number | null;
  splits: Array<{
    kilometer: number;
    paceSecondsPerKm: number;
    durationSeconds: number;
  }>;
}

const cardioSchema = z.object({
  type: z.enum(["run", "walk", "bike", "swim", "other"]),
  distanceMeters: z.number().int().positive().optional().nullable(),
  durationSeconds: z.number().int().positive().optional().nullable(),
  avgPaceSecondsPerKm: z.number().int().positive().optional().nullable(),
  avgHeartRate: z.number().int().optional().nullable(),
  caloriesBurned: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type CardioForm = z.infer<typeof cardioSchema>;

export function CardioPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: sessions = [] } = useQuery<CardioSession[]>({
    queryKey: ["cardio"],
    queryFn: () => api.get("/cardio?limit=30"),
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CardioForm>({
    resolver: zodResolver(cardioSchema),
    defaultValues: { type: "run" },
  });

  const type = watch("type");

  const logMutation = useMutation({
    mutationFn: (data: CardioForm) => api.post("/cardio", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cardio"] });
      setModalOpen(false);
      reset();
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cardio</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {sessions.length} sessions
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Log session
        </Button>
      </div>

      <div className="space-y-3">
        {sessions.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              No cardio sessions yet. Log your first run!
            </CardContent>
          </Card>
        )}

        {sessions.map((s) => (
          <Card
            key={s.id}
            className="cursor-pointer hover:border-border/80"
            onClick={() => setExpanded(expanded === s.id ? null : s.id)}
          >
            <CardContent className="py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium capitalize">{s.type}</span>
                    {s.distanceMeters && (
                      <Badge variant="secondary">
                        {formatDistance(s.distanceMeters)}
                      </Badge>
                    )}
                    {s.avgPaceSecondsPerKm && (
                      <Badge variant="secondary">
                        {formatPace(s.avgPaceSecondsPerKm)} /km
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {new Date(s.startedAt).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    {s.durationSeconds &&
                      ` · ${formatDuration(s.durationSeconds)}`}
                    {s.avgHeartRate && ` · ♥ ${s.avgHeartRate} bpm`}
                  </p>
                </div>
                {s.caloriesBurned && (
                  <span className="text-sm text-muted-foreground shrink-0">
                    {s.caloriesBurned} kcal
                  </span>
                )}
              </div>

              {expanded === s.id && s.splits.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Splits
                  </p>
                  <div className="grid gap-1">
                    {s.splits.map((split) => (
                      <div
                        key={split.kilometer}
                        className="flex justify-between text-sm"
                      >
                        <span className="text-muted-foreground">
                          km {split.kilometer}
                        </span>
                        <span className="font-mono">
                          {formatPace(split.paceSecondsPerKm)} /km
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Log cardio">
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

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Distance (m)"
              type="number"
              placeholder="e.g. 5000"
              {...register("distanceMeters", { valueAsNumber: true })}
            />
            <Input
              label="Duration (s)"
              type="number"
              placeholder="e.g. 1800"
              {...register("durationSeconds", { valueAsNumber: true })}
            />
          </div>

          {(type === "run" || type === "walk") && (
            <Input
              label="Avg pace (s/km)"
              type="number"
              placeholder="e.g. 360 = 6:00/km"
              {...register("avgPaceSecondsPerKm", { valueAsNumber: true })}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Avg HR (bpm)"
              type="number"
              {...register("avgHeartRate", { valueAsNumber: true })}
            />
            <Input
              label="Calories"
              type="number"
              {...register("caloriesBurned", { valueAsNumber: true })}
            />
          </div>

          <Input
            label="Notes (optional)"
            placeholder="How did it feel?"
            {...register("notes")}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => setModalOpen(false)}>
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
