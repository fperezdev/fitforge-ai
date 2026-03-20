import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface DayTarget {
  weekIndex: number;
  dayIndex: number;
  component?: "workout" | "cardio" | "all";
  notes?: string;
}

export function useSkipDay() {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [moved, setMoved] = useState(false);

  const skipMutation = useMutation({
    mutationFn: ({ weekIndex, dayIndex, component = "all", notes }: DayTarget) =>
      api.post("/plans/active/skip-day", { weekIndex, dayIndex, component, notes }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["activePlan"] });
      setConfirmOpen(false);
      setSkipped(true);
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ weekIndex, dayIndex }: DayTarget) =>
      api.post("/plans/active/move-day", { weekIndex, dayIndex }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["activePlan"] });
      setConfirmOpen(false);
      setMoved(true);
    },
  });

  const isPending = skipMutation.isPending || moveMutation.isPending;
  const isSkipError = skipMutation.isError;
  const isMoveError = moveMutation.isError;

  return {
    confirmOpen,
    openConfirm: () => setConfirmOpen(true),
    closeConfirm: () => setConfirmOpen(false),
    skip: (target: DayTarget) => skipMutation.mutate(target),
    move: (target: DayTarget) => moveMutation.mutate(target),
    isPending,
    isSkipError,
    isMoveError,
    // kept for backward compat — true when either action errored
    isError: isSkipError || isMoveError,
    skipped,
    moved,
    resetSkipped: () => setSkipped(false),
    resetMoved: () => setMoved(false),
  };
}
