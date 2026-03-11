import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Play } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { formatDuration } from "@/lib/utils";

interface Session {
  id: string;
  name: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
}

interface Template {
  id: string;
  name: string;
  templateExercises: Array<{ exercise: { name: string } }>;
}

export function WorkoutPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [startModal, setStartModal] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");

  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ["sessions"],
    queryFn: () => api.get("/sessions?limit=20"),
  });

  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["templates"],
    queryFn: () => api.get("/templates"),
  });

  const startMutation = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/sessions", {
        name: sessionName || undefined,
        templateId: selectedTemplate || undefined,
      }),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      navigate(`/workout/${session.id}`);
    },
  });

  const activeSession = sessions.find((s) => s.status === "in_progress");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workouts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {sessions.length} sessions logged
          </p>
        </div>
        <Button onClick={() => setStartModal(true)}>
          <Play className="h-4 w-4" />
          Start session
        </Button>
      </div>

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
              <Button
                size="sm"
                onClick={() => navigate(`/workout/${activeSession.id}`)}
              >
                Resume
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {sessions.filter((s) => s.status !== "in_progress").length === 0 && !activeSession && (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              No sessions logged yet. Start your first workout!
            </CardContent>
          </Card>
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
              <Card key={session.id} className="hover:border-border/80">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {session.name ?? "Unnamed session"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(session.startedAt).toLocaleDateString(
                          "en-US",
                          {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          }
                        )}
                        {duration && ` · ${formatDuration(duration)}`}
                      </p>
                    </div>
                    <Badge
                      variant={
                        session.status === "completed" ? "success" : "secondary"
                      }
                    >
                      {session.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>

      <Modal
        open={startModal}
        onClose={() => setStartModal(false)}
        title="Start workout"
      >
        <div className="space-y-4">
          <Input
            label="Session name (optional)"
            placeholder="e.g. Push A"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
          />

          {templates.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Start from template (optional)
              </label>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">No template – empty session</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setStartModal(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => startMutation.mutate()}
              loading={startMutation.isPending}
            >
              <Play className="h-4 w-4" />
              Start
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
