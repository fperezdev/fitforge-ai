import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Dumbbell, Pencil, Check, X } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatDuration } from "@/lib/utils";

interface SessionDetail {
  id: string;
  name: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  notes: string | null;
  exerciseEntries: Array<{
    id: string;
    order: number;
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

export function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");

  const { data: session, isLoading, isError } = useQuery<SessionDetail>({
    queryKey: ["session", id],
    queryFn: () => api.get(`/sessions/${id}`),
  });

  const notesMutation = useMutation({
    mutationFn: (notes: string | null) => api.patch<SessionDetail>(`/sessions/${id}`, { notes }),
    onSuccess: (updated: SessionDetail) => {
      qc.setQueryData(["session", id], updated);
      setEditingNotes(false);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/workout")}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <p className="text-sm text-muted-foreground text-center py-8">Session not found.</p>
      </div>
    );
  }

  const duration =
    session.completedAt
      ? Math.floor(
          (new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 1000
        )
      : null;

  const totalSets = session.exerciseEntries.flatMap((e) => e.sets).length;
  const completedSets = session.exerciseEntries.flatMap((e) => e.sets).filter((s) => s.completed).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/workout")} className="-ml-2 mb-3">
          <ArrowLeft className="h-4 w-4" />
          Workouts
        </Button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{session.name ?? "Unnamed session"}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {new Date(session.startedAt).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
          <Badge variant={session.status === "completed" ? "success" : "secondary"} className="shrink-0 mt-1">
            {session.status}
          </Badge>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Duration</p>
            <p className="text-lg font-bold">{duration ? formatDuration(duration) : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Exercises</p>
            <p className="text-lg font-bold">{session.exerciseEntries.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Sets</p>
            <p className="text-lg font-bold">{completedSets}/{totalSets}</p>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</p>
            {!editingNotes && (
              <button
                type="button"
                aria-label="Edit notes"
                onClick={() => { setNotesValue(session.notes ?? ""); setEditingNotes(true); }}
                className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {editingNotes ? (
            <div className="space-y-2">
              <textarea
                autoFocus
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                rows={3}
                placeholder="Add session notes…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              <div className="flex items-center gap-2 justify-end">
                {notesMutation.isError && (
                  <p className="text-xs text-destructive mr-auto">Failed to save</p>
                )}
                <button
                  type="button"
                  aria-label="Cancel"
                  onClick={() => setEditingNotes(false)}
                  className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Save notes"
                  disabled={notesMutation.isPending}
                  onClick={() => notesMutation.mutate(notesValue || null)}
                  className="rounded p-1 text-muted-foreground hover:text-emerald-600 transition-colors disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {session.notes ?? <span className="italic">No notes</span>}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Exercises */}
      {session.exerciseEntries.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <Dumbbell className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No exercises recorded.</p>
          </CardContent>
        </Card>
      ) : (
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
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium truncate">{entry.exercise.name}</span>
                          <Badge variant={done > 0 ? "success" : "secondary"} className="shrink-0">
                            {done}/{entry.sets.length} sets
                          </Badge>
                        </div>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform shrink-0",
                            isExpanded && "rotate-180"
                          )}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground capitalize mt-0.5">
                        {entry.exercise.primaryMuscle.replace(/_/g, " ")}
                      </p>
                    </CardHeader>
                  </button>

                  {isExpanded && (
                    <CardContent className="pt-0">
                      {/* Column headers */}
                      <div className="grid grid-cols-[2rem_1fr_1fr_1fr] gap-2 mb-2">
                        <span className="text-xs text-muted-foreground text-center">Set</span>
                        <span className="text-xs text-muted-foreground">Weight</span>
                        <span className="text-xs text-muted-foreground">Reps</span>
                        <span className="text-xs text-muted-foreground">RIR</span>
                      </div>

                      <div className="space-y-1">
                        {entry.sets.map((set) => (
                          <div
                            key={set.id}
                            className={cn(
                              "grid grid-cols-[2rem_1fr_1fr_1fr] gap-2 items-center py-1.5 rounded px-1",
                              set.completed && "bg-emerald-500/5"
                            )}
                          >
                            <span className="text-xs text-muted-foreground font-mono text-center">
                              {set.setNumber}
                            </span>
                            <span className="text-sm">
                              {set.weightKg != null ? `${set.weightKg} kg` : "—"}
                            </span>
                            <span className="text-sm">
                              {set.reps != null ? `${set.reps}` : "—"}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {set.rir != null ? `RIR ${set.rir}` : "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
}
