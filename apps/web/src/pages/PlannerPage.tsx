import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrainingPlan {
  id: string;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const newPlanSchema = z.object({
  name: z.string().min(1, "Name required"),
  description: z.string().optional(),
  microcycleLength: z.number().int().min(1).max(31),
  mesocycleLength: z.number().int().min(1).max(52),
});

type NewPlanForm = z.infer<typeof newPlanSchema>;

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PlannerPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);

  const { data: plan, isLoading } = useQuery<TrainingPlan | null>({
    queryKey: ["plans"],
    queryFn: () => api.get("/plans"),
  });

  // Redirect to editor as soon as a plan is known to exist
  useEffect(() => {
    if (isLoading) return;
    if (plan) {
      navigate(`/planner/plans/${plan.id}`, { replace: true });
    } else {
      setReady(true);
    }
  }, [isLoading, plan, navigate]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewPlanForm>({
    resolver: zodResolver(newPlanSchema),
    defaultValues: { microcycleLength: 5, mesocycleLength: 4 },
  });

  const createMutation = useMutation({
    mutationFn: (data: NewPlanForm) => api.post<TrainingPlan>("/plans", data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      navigate(`/planner/plans/${created.id}`, { replace: true });
    },
  });

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Icon + heading */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-muted p-5">
            <CalendarRange className="h-10 w-10 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold">Create your training plan</h1>
            <p className="text-sm text-muted-foreground">
              Set up your plan structure. You can assign workouts to each day after.
            </p>
          </div>
        </div>

        {/* Create form */}
        <form
          onSubmit={handleSubmit((d) => createMutation.mutate(d))}
          className="space-y-4"
          noValidate
        >
          <Input
            label="Plan name"
            placeholder="e.g. Hypertrophy Block A"
            error={errors.name?.message}
            {...register("name")}
          />
          <Input
            label="Description (optional)"
            placeholder="Goal, notes…"
            {...register("description")}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Days per week"
              type="number"
              min={1}
              max={31}
              error={errors.microcycleLength?.message}
              {...register("microcycleLength", { valueAsNumber: true })}
            />
            <Input
              label="Number of weeks"
              type="number"
              min={1}
              max={52}
              error={errors.mesocycleLength?.message}
              {...register("mesocycleLength", { valueAsNumber: true })}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            loading={isSubmitting || createMutation.isPending}
          >
            <Plus className="h-4 w-4" />
            Create plan
          </Button>
        </form>
      </div>
    </div>
  );
}
