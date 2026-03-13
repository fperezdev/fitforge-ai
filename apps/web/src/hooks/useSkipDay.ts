import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface SkipTarget {
  weekIndex: number;
  dayIndex: number;
  component?: "workout" | "cardio" | "all";
}

export function useSkipDay() {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [skipped, setSkipped] = useState(false);

  const mutation = useMutation({
    mutationFn: ({ weekIndex, dayIndex, component = "all" }: SkipTarget) =>
      api.post("/plans/active/skip-day", { weekIndex, dayIndex, component }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activePlan"] });
      setConfirmOpen(false);
      setSkipped(true);
    },
  });

  return {
    confirmOpen,
    openConfirm: () => setConfirmOpen(true),
    closeConfirm: () => setConfirmOpen(false),
    skip: (target: SkipTarget) => mutation.mutate(target),
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    skipped,
    resetSkipped: () => setSkipped(false),
  };
}
