import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewPlanForm>({
    resolver: zodResolver(newPlanSchema),
    defaultValues: { microcycleLength: 5, mesocycleLength: 4 },
  });

  const createMutation = useMutation({
    mutationFn: (data: NewPlanForm) => api.post<{ id: string }>("/plans", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      navigate("/planner", { replace: true });
    },
  });

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
