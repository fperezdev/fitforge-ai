import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Activity } from "lucide-react";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistance, formatDuration, formatPace } from "@/lib/utils";

interface CardioSessionDetail {
  id: string;
  type: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  avgPaceSecondsPerKm: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  caloriesBurned: number | null;
  elevationGainMeters: number | null;
  notes: string | null;
}

export function CardioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: session, isLoading, isError } = useQuery<CardioSessionDetail>({
    queryKey: ["cardio", id],
    queryFn: () => api.get(`/cardio/${id}`),
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
        <Button variant="ghost" size="sm" onClick={() => navigate("/cardio")}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <p className="text-sm text-muted-foreground text-center py-8">Session not found.</p>
      </div>
    );
  }

  const statItems = [
    session.distanceMeters != null && {
      label: "Distance",
      value: formatDistance(session.distanceMeters),
    },
    session.durationSeconds != null && {
      label: "Duration",
      value: formatDuration(session.durationSeconds),
    },
    session.avgPaceSecondsPerKm != null && {
      label: "Avg Pace",
      value: `${formatPace(session.avgPaceSecondsPerKm)} /km`,
    },
    session.avgHeartRate != null && {
      label: "Avg HR",
      value: `${session.avgHeartRate} bpm`,
    },
    session.maxHeartRate != null && {
      label: "Max HR",
      value: `${session.maxHeartRate} bpm`,
    },
    session.caloriesBurned != null && {
      label: "Calories",
      value: `${session.caloriesBurned} kcal`,
    },
    session.elevationGainMeters != null && {
      label: "Elevation",
      value: `${session.elevationGainMeters} m`,
    },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/cardio")} className="-ml-2 mb-3">
          <ArrowLeft className="h-4 w-4" />
          Cardio
        </Button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-2xl font-bold capitalize">{session.type}</h1>
            </div>
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

      {/* Stats grid */}
      {statItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {statItems.map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="py-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
                <p className="text-lg font-bold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Notes */}
      {session.notes && (
        <Card>
          <CardContent className="py-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Notes</p>
            <p className="text-sm">{session.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
