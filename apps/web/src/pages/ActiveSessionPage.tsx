import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Check, ChevronDown, Timer, StopCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Session {
  id: string;
  name: string | null;
  status: string;
  startedAt: string;
  exerciseEntries: Array<{
    id: string;
    order: number;
    targetRepMin: number | null;
    targetRepMax: number | null;
    targetRir: number | null;
    restSeconds: number | null;
    exercise: { id: string; name: string; primaryMuscle: string };
    sets: Array<{
      id: string;
      setNumber: number;
      type: string;
      weightKg: string | null;
      reps: number | null;
      rir: number | null;
      completed: boolean;
    }>;
  }>;
}

function RestTimer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [remaining, setRemaining] = useState(seconds);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const end = Date.now() + seconds * 1000;
    const t = setInterval(() => {
      const left = Math.round((end - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(t);
        setRemaining(0);
        onDoneRef.current();
      } else {
        setRemaining(left);
      }
    }, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = (remaining / seconds) * 100;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
      <Timer className="h-4 w-4 text-primary" />
      <div className="flex-1">
        <div className="h-1.5 rounded-full bg-border overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-1000"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className="text-sm font-mono font-bold tabular-nums">
        {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
      </span>
      <Button size="sm" variant="ghost" onClick={onDone} className="h-7">
        Skip
      </Button>
    </div>
  );
}

function SetRow({
  set,
  repMin,
  repMax,
  targetRir,
  onUpdate,
}: {
  set: Session["exerciseEntries"][0]["sets"][0];
  repMin: number | null;
  repMax: number | null;
  targetRir: number | null;
  onUpdate: (data: Partial<typeof set>) => void;
}) {
  const [weight, setWeight] = useState(set.weightKg ?? "");
  const [reps, setReps] = useState(String(set.reps ?? ""));
  const [rir, setRir] = useState(set.rir != null ? String(set.rir) : "");

  const repPlaceholder =
    repMin != null && repMax != null
      ? repMin === repMax
        ? String(repMin)
        : `${repMin}–${repMax}`
      : "reps";

  const rirPlaceholder = targetRir != null ? String(targetRir) : "RIR";

  return (
    <div
      className={cn(
        "grid grid-cols-[2rem_1fr_1fr_1fr_2rem] gap-2 items-center py-1.5",
        set.completed && "opacity-60",
      )}
    >
      <span className="text-xs text-muted-foreground font-mono text-center">{set.setNumber}</span>
      <input
        type="number"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        onBlur={() => onUpdate({ weightKg: weight || null })}
        placeholder="kg"
        className="h-8 w-full rounded border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label={`Set ${set.setNumber} weight`}
      />
      <input
        type="number"
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        onBlur={() => onUpdate({ reps: reps ? Number(reps) : null })}
        placeholder={repPlaceholder}
        className="h-8 w-full rounded border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label={`Set ${set.setNumber} reps`}
      />
      <input
        type="number"
        min={0}
        max={10}
        value={rir}
        onChange={(e) => setRir(e.target.value)}
        onBlur={() => onUpdate({ rir: rir !== "" ? Number(rir) : null })}
        placeholder={rirPlaceholder}
        className="h-8 w-full rounded border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label={`Set ${set.setNumber} RIR`}
      />
      <button
        onClick={() => onUpdate({ completed: !set.completed })}
        className={cn(
          "h-7 w-7 rounded flex items-center justify-center transition-colors",
          set.completed ? "bg-emerald-500 text-white" : "border border-border hover:bg-accent",
        )}
        aria-label={set.completed ? "Mark incomplete" : "Mark complete"}
      >
        <Check className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ActiveSessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [elapsed, setElapsed] = useState(0);
  const [restTimer, setRestTimer] = useState<{ seconds: number } | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [finishModal, setFinishModal] = useState(false);

  const { data: session, isLoading } = useQuery<Session>({
    queryKey: ["session", id],
    queryFn: () => api.get(`/sessions/${id}`),
    refetchInterval: false,
  });

  // Elapsed timer
  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const updateSetMutation = useMutation({
    mutationFn: ({
      entryId,
      setId,
      data,
    }: {
      entryId: string;
      setId: string;
      data: Record<string, unknown>;
    }) => api.patch(`/sessions/${id}/exercises/${entryId}/sets/${setId}`, data),
    onMutate: async ({ entryId, setId, data }) => {
      await queryClient.cancelQueries({ queryKey: ["session", id] });
      const previous = queryClient.getQueryData<Session>(["session", id]);
      queryClient.setQueryData<Session>(["session", id], (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          exerciseEntries: prev.exerciseEntries.map((entry) =>
            entry.id !== entryId
              ? entry
              : {
                  ...entry,
                  sets: entry.sets.map((s) => (s.id !== setId ? s : { ...s, ...data })),
                },
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["session", id], context.previous);
      }
    },
  });

  const addSetMutation = useMutation({
    mutationFn: ({ entryId, setNumber }: { entryId: string; setNumber: number }) =>
      api.post(`/sessions/${id}/exercises/${entryId}/sets`, {
        setNumber,
        type: "working",
        completed: false,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["session", id] }),
  });

  const finishMutation = useMutation({
    mutationFn: () => api.patch(`/sessions/${id}`, { status: "completed" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["activePlan"] });
      navigate("/workout");
    },
  });

  if (isLoading || !session) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
        <Skeleton className="h-1.5 rounded-full" />
        <div className="space-y-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      </div>
    );
  }

  const totalSets = session.exerciseEntries.flatMap((e) => e.sets).length;
  const completedSets = session.exerciseEntries
    .flatMap((e) => e.sets)
    .filter((s) => s.completed).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{session.name ?? "Workout"}</h1>
          <p className="text-sm text-muted-foreground">
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} · {completedSets}/
            {totalSets} sets
          </p>
        </div>
        <Button variant="destructive" size="sm" onClick={() => setFinishModal(true)}>
          <StopCircle className="h-4 w-4" />
          Finish
        </Button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-border overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: totalSets > 0 ? `${(completedSets / totalSets) * 100}%` : "0%" }}
        />
      </div>

      {/* Rest timer */}
      {restTimer && <RestTimer seconds={restTimer.seconds} onDone={() => setRestTimer(null)} />}

      {/* Exercise list */}
      <div className="space-y-3">
        {session.exerciseEntries
          .sort((a, b) => a.order - b.order)
          .map((entry) => {
            const isExpanded = expandedEntry === entry.id;
            const done = entry.sets.filter((s) => s.completed).length;

            return (
              <Card key={entry.id}>
                <button
                  className="w-full text-left"
                  onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                  aria-expanded={isExpanded}
                >
                  <CardHeader className="py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{entry.exercise.name}</span>
                        <Badge variant={done > 0 ? "success" : "secondary"}>
                          {done}/{entry.sets.length} sets
                        </Badge>
                      </div>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform",
                          isExpanded && "rotate-180",
                        )}
                      />
                    </div>
                  </CardHeader>
                </button>

                {isExpanded && (
                  <CardContent className="pt-0 space-y-1">
                    {/* Column headers */}
                    <div className="grid grid-cols-[2rem_1fr_1fr_1fr_2rem] gap-2 mb-1">
                      <span className="text-xs text-muted-foreground text-center">Set</span>
                      <span className="text-xs text-muted-foreground">Weight</span>
                      <span className="text-xs text-muted-foreground">Reps</span>
                      <span className="text-xs text-muted-foreground">RIR</span>
                      <span />
                    </div>

                    {entry.sets.map((set) => (
                      <SetRow
                        key={set.id}
                        set={set}
                        repMin={entry.targetRepMin}
                        repMax={entry.targetRepMax}
                        targetRir={entry.targetRir}
                        onUpdate={(data) => {
                          // Start rest timer on completion — use template value or fall back to 90s
                          if (data.completed) setRestTimer({ seconds: entry.restSeconds ?? 90 });
                          updateSetMutation.mutate({
                            entryId: entry.id,
                            setId: set.id,
                            data,
                          });
                        }}
                      />
                    ))}

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full mt-2 text-muted-foreground"
                      onClick={() =>
                        addSetMutation.mutate({
                          entryId: entry.id,
                          setNumber: entry.sets.length + 1,
                        })
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add set
                    </Button>
                  </CardContent>
                )}
              </Card>
            );
          })}
      </div>

      <Modal open={finishModal} onClose={() => setFinishModal(false)} title="Finish workout?">
        <p className="text-sm text-muted-foreground mb-6">
          {completedSets}/{totalSets} sets completed. This will mark the session as done and return
          you to the workout page.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setFinishModal(false)}>
            Keep going
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setFinishModal(false);
              finishMutation.mutate();
            }}
            loading={finishMutation.isPending}
          >
            Finish
          </Button>
        </div>
      </Modal>
    </div>
  );
}
